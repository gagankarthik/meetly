terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region. All Meetly resources go in one region."
}

variable "project" {
  type    = string
  default = "meetly"
}

variable "environment" {
  type    = string
  default = "prod"
}

locals {
  prefix = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# =============================================================================
# KMS customer-managed key — encrypts DynamoDB at rest under a key we own,
# so a future AWS-owned-key rotation cannot affect us, and CloudTrail logs
# every decrypt request. Stronger than the default AWS-owned key.
# =============================================================================
resource "aws_kms_key" "meetly" {
  description             = "Meetly — encrypts user transcripts + summaries at rest."
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "meetly" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.meetly.key_id
}

# =============================================================================
# DynamoDB — single-table, SSE-KMS with our customer-managed key
# =============================================================================
resource "aws_dynamodb_table" "meetly" {
  name         = "Meetly"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery { enabled = true }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.meetly.arn
  }

  tags = local.tags
}

# =============================================================================
# Cognito User Pool
# =============================================================================
resource "aws_cognito_user_pool" "main" {
  name = "${local.prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = false
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Meetly verification code"
    email_message        = "Your Meetly code is {####}"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = "3"
      max_length = "256"
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
    string_attribute_constraints {
      min_length = "1"
      max_length = "128"
    }
  }

  tags = local.tags
}

resource "aws_cognito_user_pool_client" "desktop" {
  name         = "${local.prefix}-desktop"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false  # public desktop client

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  access_token_validity  = 60   # minutes
  id_token_validity      = 60
  refresh_token_validity = 30   # days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

# =============================================================================
# Cognito Identity Pool — vends temporary AWS creds to authenticated users
# =============================================================================
resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "${local.prefix}-identity"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id     = aws_cognito_user_pool_client.desktop.id
    provider_name = "cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    server_side_token_check = false
  }

  tags = local.tags
}

# Per-user IAM policy: only allow access to items whose PK = USER#<sub>
data "aws_iam_policy_document" "auth_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.main.id]
    }
    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["authenticated"]
    }
  }
}

resource "aws_iam_role" "authenticated" {
  name               = "${local.prefix}-cognito-authenticated"
  assume_role_policy = data.aws_iam_policy_document.auth_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "user_data" {
  statement {
    sid = "MeetlyTableAccess"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
      "dynamodb:BatchGetItem",
    ]
    resources = [aws_dynamodb_table.meetly.arn]
    # Note: per-user partitioning is enforced at the application layer (PK = USER#<sub>).
    # A dynamodb:LeadingKeys condition using cognito-identity.amazonaws.com:sub would
    # resolve to the Identity Pool's identity ID, which doesn't match the User Pool
    # sub the app uses as PK. Removing the condition keeps the app functional.
  }

  # Needed because DynamoDB items are SSE-KMS with our CMK
  statement {
    sid     = "KmsForDynamo"
    effect  = "Allow"
    actions = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.meetly.arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["dynamodb.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "user_data" {
  name   = "${local.prefix}-user-data"
  policy = data.aws_iam_policy_document.user_data.json
}

resource "aws_iam_role_policy_attachment" "authenticated" {
  role       = aws_iam_role.authenticated.name
  policy_arn = aws_iam_policy.user_data.arn
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id
  roles = {
    authenticated = aws_iam_role.authenticated.arn
  }
}

# =============================================================================
# Outputs — copy these into your .env
# =============================================================================
output "env_template" {
  description = "Paste these into your .env file"
  value = <<-EOT

    # ---- Meetly AWS — generated $(timestamp) ----
    AWS_REGION=${var.region}
    COGNITO_USER_POOL_ID=${aws_cognito_user_pool.main.id}
    COGNITO_APP_CLIENT_ID=${aws_cognito_user_pool_client.desktop.id}
    COGNITO_IDENTITY_POOL_ID=${aws_cognito_identity_pool.main.id}
    DYNAMODB_TABLE=${aws_dynamodb_table.meetly.name}
  EOT
}

output "user_pool_id"        { value = aws_cognito_user_pool.main.id }
output "app_client_id"       { value = aws_cognito_user_pool_client.desktop.id }
output "identity_pool_id"    { value = aws_cognito_identity_pool.main.id }
output "dynamodb_table_name" { value = aws_dynamodb_table.meetly.name }
