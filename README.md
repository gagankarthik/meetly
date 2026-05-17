# Meetly

A stealth desktop meeting assistant. A glass overlay sits on top of every window, transcribes both sides of the conversation in real time, and lets you ask GPT-4o for help mid-meeting — without ever being visible to screen-share.

```
┌─────────────────────────────┐
│ ● Live · 12:34   ▆▅▃ ▆▅▂   │
├─────────────────────────────┤
│ You                          │
│ So if we shift the launch…   │
│ Sarah                        │
│ I'm worried about the QA…    │
├─────────────────────────────┤
│ ✦ You asked                  │
│ How do I respond to the QA   │
│ concern?                     │
│ ✦ Acknowledge → reframe …    │
├─────────────────────────────┤
│ [⏺ Start]  [✦ Ask AI]        │
└─────────────────────────────┘
```

## Stack

- **Desktop**: Electron 32 + Vite + React 18 + TypeScript + Tailwind + Framer Motion + Zustand
- **Transcription**: Deepgram Nova-3 streaming over WebSocket — captures mic + system audio (loopback), routes mic to channel 0 + system to channel 1, and uses diarization for speaker labels
- **AI**: OpenAI GPT-4o — streaming "Ask AI" mid-meeting, plus a JSON-structured post-meeting summarizer that extracts decisions + action items
- **Auth**: AWS Cognito User Pool — tokens cached in OS keychain (Windows Credential Vault / macOS Keychain) via `keytar`
- **Storage**: DynamoDB single-table, called directly from the desktop using temporary credentials vended by the Cognito Identity Pool. IAM policy clamps each session to rows where `PK = USER#<their sub>`, so a compromised client cannot read another user's data.
- **Stealth**: `setContentProtection(true)` — invisible to screen-share on Windows (`SetWindowDisplayAffinity / WDA_EXCLUDEFROMCAPTURE`) and macOS (`NSWindowSharingNone`)

## Setup

### 1. Provision AWS (one-time)

```sh
cd infra
terraform init
terraform apply
terraform output env_template   # copy the lines it prints
```

### 2. Configure env

```sh
cp .env.example .env
# paste the terraform output, plus your Deepgram and OpenAI keys
```

Required keys:
- `DEEPGRAM_API_KEY` — https://console.deepgram.com
- `OPENAI_API_KEY` — https://platform.openai.com
- The four AWS values from `terraform output`

### 3. Install + run

```sh
npm install
npm run dev
```

The auth window opens first. After sign-up + email confirmation, the overlay floats in the top-right corner.

### 4. Package

```sh
npm run dist:win   # Windows NSIS installer
npm run dist:mac   # macOS dmg (Intel + Apple Silicon)
```

Installers land in `release/<version>/`.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘ \` / `Ctrl \` | Toggle overlay |
| `⌘ ↵` / `Ctrl ↵` | Focus Ask-AI input |
| `⌘ ⇧ H` / `Ctrl ⇧ H` | Hide everywhere |

## Architecture notes

```
electron/
├── main/index.ts          ← app entry, windows, hotkeys, tray
├── windows/               ← overlay, auth, library window factories
├── services/
│   ├── cognito.ts         ← sign-in/up/refresh, token storage
│   ├── credentials.ts     ← identity-pool → AWS creds
│   ├── dynamodb.ts        ← single-table access
│   ├── deepgram.ts        ← WS client, segment broadcast
│   ├── openai.ts          ← streaming ask + JSON summarizer
│   ├── secrets.ts         ← keytar wrapper
│   └── stealth.ts         ← setContentProtection
└── ipc/index.ts           ← all IPC handlers in one place

src/
├── entries/               ← per-window React roots
├── screens/
│   ├── overlay/           ← the stealth panel
│   ├── auth/              ← login / sign-up / confirm
│   └── library/           ← meeting history + detail
├── components/ui/         ← Button, Field, Logo, LevelMeter, RecordingDot
├── stores/                ← zustand: meeting, ai, auth
├── lib/audio.ts           ← mic + system loopback → PCM16 chunks
└── styles/globals.css     ← glass, eyebrow, shimmer

shared/types.ts            ← typed IPC channels + DTOs used by both sides
infra/main.tf              ← Terraform: Cognito + Identity Pool + DynamoDB + scoped IAM
```

### Data flow during a meeting

```
mic + system loopback ─► WebAudio (renderer) ─► PCM16 chunks
                                              ▼
                                       IPC (transcribe:chunk)
                                              ▼
                                  Deepgram WS (main process)
                                              ▼
                          interim/final segments via IPC
                                              ▼
                               zustand `useMeeting` (renderer)
                                              ▼
                                   TranscriptPane renders
```

When recording stops:
1. Renderer flushes the final segments to DynamoDB
2. Main asks GPT-4o for a JSON summary (one-liner, bullets, decisions, action items)
3. Summary written to DynamoDB
4. Overlay shows "Saved" then returns to standby

## Security model

- API keys for Deepgram and OpenAI live **only in the main process**. The renderer never sees them.
- AWS access is **per-user**: even with the IAM role assumed, the policy condition `dynamodb:LeadingKeys = USER#${cognito-identity.amazonaws.com:sub}` makes cross-user access impossible.
- Auth tokens are stored in the OS keychain, never in plain files.
- Content-protection is on by default. To screenshot for design work, set `VITE_DEV_DISABLE_STEALTH=true`.

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide — covers AWS infra provisioning, building the desktop installers for Windows + macOS, deploying the marketing site (`landing/`), code-signing, and a CI/CD template.

## License

UNLICENSED — proprietary.
