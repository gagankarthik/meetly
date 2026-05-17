# Meetly infrastructure

Single Terraform module that provisions everything Meetly needs in AWS:

- **DynamoDB** single-table (`Meetly`) — meetings, transcripts, summaries
- **Cognito User Pool** + desktop App Client (USER_PASSWORD + REFRESH flows)
- **Cognito Identity Pool** — vends scoped temporary AWS credentials to signed-in users
- **IAM role** with a per-user policy that restricts each user to rows where `PK = USER#<their sub>` (zero-trust at the database layer; the desktop app cannot read another user's data even if compromised)

## Prerequisites

- Terraform `>= 1.5`
- AWS account with admin (or scoped) credentials in your shell (`aws configure` or env vars)

## Apply

```sh
cd infra
terraform init
terraform apply
```

When it finishes, run:

```sh
terraform output env_template
```

…and paste those lines into your `.env` at the project root.

## Tear down

```sh
terraform destroy
```

Note: DynamoDB has point-in-time recovery enabled. AWS keeps backups for 35 days — destroy will purge them too.
