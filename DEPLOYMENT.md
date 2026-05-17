# Deployment Guide

Meetly has three deployable artifacts:

1. **Desktop application** (Electron, Win + macOS) — what end users install
2. **AWS infrastructure** (Terraform) — Cognito, DynamoDB, KMS, IAM (provisioned **once** by you)
3. **Marketing site** (`landing/`) — static HTML, deployable anywhere

---

## Who does what

| Audience | What they do |
|---|---|
| **End user** | Downloads `Meetly-<v>-win-x64.exe`, runs it, signs up with email + 6-digit code from email, uses the app. **No AWS account, no Terraform, no env vars.** |
| **You (release engineer)** | Provisions AWS infra once with Terraform, populates `.env.local` with the outputs, runs `npm run dist`. The compiled `.exe` has all config baked in. |

If your end user is being asked to "run terraform apply", you shipped a build that wasn't built with `.env.local` populated. The new build step refuses to build without it — see §1.

---

## 0. Prerequisites (release engineer only)

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20.18 | Build + runtime |
| npm | ≥ 10 | Package manager |
| Terraform | ≥ 1.5 | One-time infra provisioning |
| AWS CLI | ≥ 2 | Optional, for verification |
| An AWS account with admin perms | — | Only for `terraform apply` |

End users need: **the installer**. Nothing else.

---

## 1. AWS infrastructure (one-time per environment)

### 1.1 Provision

```sh
cd infra
terraform init
terraform apply -var region=us-east-2
```

What gets created:

| Resource | Purpose |
|---|---|
| `aws_kms_key.meetly` | Customer-managed key encrypting DynamoDB at rest |
| `aws_dynamodb_table.meetly` | Single-table — PK/SK schema, PAY_PER_REQUEST, PITR on |
| `aws_cognito_user_pool.main` | Email + password authentication with OTP verification |
| `aws_cognito_user_pool_client.desktop` | Public client (no secret) for the desktop app |
| `aws_cognito_identity_pool.main` | Vends temporary AWS creds to signed-in users |
| `aws_iam_role.authenticated` + policy | Per-user scoped DynamoDB access |

### 1.2 Capture outputs into `.env.local`

```sh
terraform output env_template
```

Paste the printed lines into `.env.local` at the repo root. The required values are:

```
AWS_REGION=us-east-2
COGNITO_USER_POOL_ID=us-east-2_XXXXXXXXX
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_IDENTITY_POOL_ID=us-east-2:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DYNAMODB_TABLE=Meetly

# These are baked into the .exe so end users can use the app immediately.
# WARNING: extractable from app.asar by anyone. Set billing caps.
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
```

### 1.3 Email-OTP scale note

The Cognito user pool is configured with `email_sending_account = COGNITO_DEFAULT`, which has a **hard limit of 50 emails per day per AWS account**. Fine for early users; if you cross that, switch to Amazon SES:

1. Verify a sending domain in SES (same region as Cognito).
2. Move out of the SES sandbox (request production access).
3. Update `infra/main.tf`:
   ```hcl
   email_configuration {
     email_sending_account = "DEVELOPER"
     source_arn            = "arn:aws:ses:us-east-2:<account>:identity/<verified-domain>"
     from_email_address    = "no-reply@yourdomain.com"
   }
   ```
4. `terraform apply`.

### 1.4 Tear down

```sh
cd infra
terraform destroy -var region=us-east-2
```

> ⚠️ Wipes the DynamoDB table (all user data) and the Cognito pool. Back up first.

---

## 2. Build a release (developer-only)

### 2.1 Dev run

```sh
npm install
npm run dev
```

In dev, the app reads from `.env.local` at runtime. Sign up → 6-digit code arrives in your email → enter it → Hub opens.

### 2.2 Production build

The build step **refuses to start** if `.env.local` is missing the required AWS IDs — that protects end users from getting a broken installer.

```sh
# Windows installer (NSIS .exe)
npm run dist:win

# macOS DMG (Universal Intel + Apple Silicon)
npm run dist:mac

# Both
npm run dist
```

Artifacts land in `release/<version>/`:

```
release/0.1.0/
├── Meetly-0.1.0-win-x64.exe
├── Meetly-0.1.0-mac-arm64.dmg
└── Meetly-0.1.0-mac-x64.dmg
```

Verify the baked config landed in the binary:

```sh
# Should print your COGNITO_USER_POOL_ID
grep -ao 'us-east-[12]_[A-Za-z0-9]*' dist-electron/main/index.js | head -1
```

### 2.3 What gets baked into the .exe

| Value | Why it's safe to bake |
|---|---|
| `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `COGNITO_IDENTITY_POOL_ID` | Public identifiers; visible in any signed-in user's network traffic. |
| `AWS_REGION`, `DYNAMODB_TABLE` | Same. |
| `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` | **Not** safe in the strict sense — anyone can extract them from `app.asar`. Required for the "zero-setup" install experience. **Set billing caps + usage alarms.** Per-user BYOK still overrides (Settings → API keys). |

Admin AWS credentials (`AWS_ADMIN_*`) are no longer used or read anywhere — signup goes through the public Cognito OTP flow instead.

### 2.4 What end users do

1. Download `Meetly-<v>-win-x64.exe` from your distribution channel.
2. Install (NSIS — choose install location).
3. Open the app → "Create your account" → email + password → check email for code → enter code → in.

No AWS account. No Terraform. No env vars. No admin keys.

### 2.5 App icon

`resources/icon.png` is generated by `scripts/generate-icon.cjs`. Regenerate if you change the brand:

```sh
node scripts/generate-icon.cjs
```

For production-quality icons, replace with proper `.ico` (Windows) and `.icns` (macOS) assets and update `electron-builder` config in `package.json`.

### 2.6 Code-signing (deferred — strongly recommended before public launch)

- **Windows**: provide `CSC_LINK` + `CSC_KEY_PASSWORD` env vars pointing to your code-sign cert. Without this, Windows SmartScreen warns users on first install.
- **macOS**: requires an Apple Developer account. Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. The build will codesign + notarize via electron-builder.

### 2.7 Distribution channels

| Channel | How |
|---|---|
| Direct download | Host `.exe` / `.dmg` on the landing site or S3 + CloudFront |
| Auto-update | Configure `electron-updater` against an S3 bucket or GitHub Releases (not enabled by default — add to `package.json` `build.publish`) |

---

## 3. Cost guardrails for the baked API keys

Because Deepgram + OpenAI keys ship in the binary, **set caps before public distribution**:

- **OpenAI**: dashboard → Limits → set monthly hard limit. Add usage alert at 50%.
- **Deepgram**: account → billing → set spend cap. Watch the usage page.
- **AWS**: Billing → Budgets → create a monthly budget with 80%/100% alerts.

If a key gets abused, the procedure is:

1. Revoke the key at the provider dashboard.
2. Mint a new key.
3. Update `.env.local`.
4. `npm run dist:win` (or `:mac`) to produce a fresh installer.
5. Ship the new installer; auto-update if configured will roll out automatically.

Users who hit the "key revoked" error in the old build can paste their own key in Settings → API keys.

---

## 4. Landing page (`landing/`)

The marketing site is a single static `index.html` — Tailwind via CDN, no build step.

### 4.1 Local preview

```sh
cd landing
python -m http.server 4000   # or: npx serve
# open http://localhost:4000
```

### 4.2 Deploy via GitHub Pages (recommended)

The repo ships with `.github/workflows/pages.yml`. On every push to `main` that touches `landing/**`, it bundles the folder and deploys to Pages via the official `actions/deploy-pages` action.

One-time setup:
1. Push the repo to GitHub.
2. Repo Settings → Pages → **Source: GitHub Actions**.
3. Push any change under `landing/` (or run the workflow manually).
4. Site appears at `https://<user>.github.io/<repo>/`.

For a custom domain, add a `landing/CNAME` file with the bare domain and configure DNS as GitHub instructs.

### 4.3 Alternative hosts

```sh
# Netlify
npx netlify-cli deploy --dir=landing --prod
# Vercel
npx vercel --cwd landing --prod
# S3 + CloudFront
aws s3 sync landing s3://meetly-landing/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

---

## 5. CI / CD (suggested)

A minimal GitHub Actions workflow to drop into `.github/workflows/release.yml`. Store `.env.local` values as GitHub repo secrets:

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - name: Materialize .env.local from secrets
        shell: bash
        run: |
          cat > .env.local <<EOF
          AWS_REGION=${{ secrets.AWS_REGION }}
          COGNITO_USER_POOL_ID=${{ secrets.COGNITO_USER_POOL_ID }}
          COGNITO_APP_CLIENT_ID=${{ secrets.COGNITO_APP_CLIENT_ID }}
          COGNITO_IDENTITY_POOL_ID=${{ secrets.COGNITO_IDENTITY_POOL_ID }}
          DYNAMODB_TABLE=${{ secrets.DYNAMODB_TABLE }}
          OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
          DEEPGRAM_API_KEY=${{ secrets.DEEPGRAM_API_KEY }}
          EOF
      - run: npm run dist
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-installer
          path: release/**/*.{exe,dmg}
```

---

## 6. Release checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `.env.local` is populated from Terraform outputs + has the API keys
- [ ] `npm run dist` succeeds on the target OS
- [ ] Sanity-check baked config: `grep -ao 'COGNITO' dist-electron/main/index.js` finds nothing literal but the pool ID appears as a string
- [ ] Install the produced .exe on a clean machine — sign up, get the OTP email, confirm, sign in
- [ ] Test a full meeting: start → talk → stop → summary appears in Library
- [ ] Update `version` in `package.json` and tag in git
- [ ] Landing page links to the new installers

---

## 7. Operational notes

- **Costs at idle**: KMS CMK ≈ $1/month. DynamoDB PAY_PER_REQUEST → $0 when no usage. Cognito → free up to 50k MAU.
- **Logs**: each window writes to `%APPDATA%/Meetly/logs` (Windows) or `~/Library/Logs/Meetly` (macOS).
- **Wiping a user's data**: `aws dynamodb query --table-name Meetly --key-condition-expression "PK = :pk" --expression-attribute-values '{":pk":{"S":"USER#<sub>"}}'` then batch-delete.
- **Rotating Cognito client secret**: not applicable — desktop client is public (`generate_secret = false`).
- **Removing a baked API key from circulation**: revoke the key, build a new installer (§3).
