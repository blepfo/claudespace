# Claude Code ↔ Slack Bridge

Bidirectional Slack integration for claudespace. Each claudespace pane gets its own Slack thread—Claude's notifications flow to the thread, and user replies in the thread get routed back to the correct pane via `tmux send-keys`.

## Architecture

```
claudespace cmd_add ──POST /thread──> Bridge Server ──creates thread──> Slack
                                           ^                              |
Claude Code hooks ──POST /notify───────────┘       <──thread replies──────┘
                                           |
                                           └──tmux send-keys──> correct pane
```

Three components:
1. **Bridge server** (`claude-slack-bridge/`) — Node.js with @slack/bolt (Socket Mode) + Express HTTP
2. **Hook script** (`hooks/notify-slack.sh`) — Pipes Claude Code Notification/Stop events to bridge
3. **claudespace modifications** — `cmd_add`/`cmd_hide`/`cmd_delete` call bridge to create/close threads

## Prerequisites

- Node.js (v18+)
- `jq` — used by the hook script to parse JSON from stdin (`brew install jq` on macOS)
- `curl` — used by the hook script and claudespace to POST to the bridge
- `tmux` — already required by claudespace

## Installation

### 1. Create a Slack App

Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app (from scratch, not a manifest).

#### Enable Socket Mode

1. Go to **Settings → Socket Mode** (left sidebar)
2. Toggle **Enable Socket Mode** to On
3. When prompted, create an app-level token with the `connections:write` scope
4. Copy this token — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)

#### Add Bot Token Scopes

1. Go to **OAuth & Permissions** (left sidebar)
2. Scroll to **Scopes → Bot Token Scopes**
3. Click **Add an OAuth Scope** and add each of these:
   - `chat:write` — lets the bot post messages and thread replies
   - `channels:history` — lets the bot receive message events in public channels
   - `groups:history` — (only if using private channels) lets the bot receive message events in private channels

#### Subscribe to Events

**This is separate from OAuth scopes and is required for the bot to receive messages.**

1. Go to **Event Subscriptions** (left sidebar)
2. Toggle **Enable Events** to On
3. Expand **Subscribe to bot events**
4. Click **Add Bot User Event** and add:
   - `message.channels` — notifies the bot of messages in public channels
   - `message.groups` — (only if using private channels) notifies the bot of messages in private channels
5. Click **Save Changes**

#### Install to Workspace

1. Go to **OAuth & Permissions** (left sidebar)
2. Click **Install to Workspace** (or **Reinstall to Workspace** if prompted)
3. Authorize the app
4. Copy the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN` (starts with `xoxb-`)

**Important:** You must reinstall the app any time you change scopes or event subscriptions.

#### Invite the Bot

1. In Slack, go to the channel you want threads posted in
2. Type `/invite @YourBotName` to add the bot to the channel
3. Get the **channel ID**: right-click the channel name → View channel details → copy the ID at the bottom

### 2. Configure Environment Variables

```bash
cd claude-slack-bridge
cp .env.example .env
```

Edit `.env` and fill in the three required values:

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | Yes | Bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Yes | App-level token for Socket Mode (`xapp-...`) |
| `SLACK_CHANNEL_ID` | Yes | Channel ID to post threads in |
| `BRIDGE_PORT` | No | HTTP port (default: `7890`) |
| `MAPPING_TTL_MS` | No | Pane mapping TTL in ms (default: `86400000` = 24h) |
| `CSPACE_SESSION` | No | tmux session name (default: `claudespace`) |

The bridge uses `dotenv` — it loads `.env` automatically from the working directory at startup.

### 3. Install Node Dependencies

```bash
cd claude-slack-bridge
npm install
```

This installs `@slack/bolt`, `express`, `dotenv`, and TypeScript tooling. The `node_modules/` and `dist/` directories are gitignored.

### 4. Configure Claude Code Hooks

Add hooks to `~/.claude/settings.json` so Claude Code posts notifications to the bridge. Merge the `hooks` key as a sibling of the existing `permissions` key:

```json
{
  "permissions": { ... },
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/claudespace/hooks/notify-slack.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/claudespace/hooks/notify-slack.sh"
          }
        ]
      }
    ]
  }
}
```

Replace `/absolute/path/to/claudespace` with the actual path to your claudespace checkout. The hook script must use an absolute path.

### 5. Start the Bridge

```bash
claudespace slack          # starts in a tmux window
claudespace slack stop     # stops it
```

Or run directly:

```bash
cd claude-slack-bridge
npm run dev
```

Verify it's running:

```bash
curl localhost:7890/health
# → {"ok":true,"mappings":0,"uptime":1.234}
```

For production use, `npm run build && npm start` compiles TypeScript to `dist/` and runs the compiled JS.

### Troubleshooting

- **`not_in_channel` error**: The bot needs to be invited to the channel. Run `/invite @YourBotName` in the channel.
- **No events received when replying in threads**: Make sure you have both the OAuth scope (`channels:history`) AND the event subscription (`message.channels`). These are configured in different sections of the Slack app settings. Reinstall the app after changing either.
- **Socket Mode connected but no message events**: Verify Event Subscriptions is toggled On and `message.channels` is listed under "Subscribe to bot events".

## Usage

Once the bridge is running:

- `claudespace add <name>` creates a Slack thread for the new session
- Claude Code notifications (permission prompts, task updates) appear in the thread
- When Claude stops, its final message is posted to the thread
- Reply in the Slack thread to send input to the pane:
  - `y`, `yes`, `ok`, `approve`, `go`, `yeah`, `yep`, `sure` → sends `y`
  - `n`, `no`, `deny`, `reject`, `nope` → sends `n`
  - Anything else → sent verbatim
- `claudespace hide` / `claudespace delete` posts a closing message and removes the mapping

The bridge is fully optional — if it's not running, claudespace works normally (curl fails silently in the background).

## File Layout

```
claude-slack-bridge/
├── .env.example        # Template for environment variables
├── .env                # Your actual config (gitignored)
├── .gitignore          # Ignores node_modules/, dist/, .env
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript config (ES2022, NodeNext)
└── src/
    ├── index.ts        # Entry: starts Bolt + Express
    ├── config.ts       # Env var loading/validation (uses dotenv)
    ├── server.ts       # Express routes: POST /thread, /notify, /close; GET /health
    ├── slack.ts        # @slack/bolt Socket Mode app + reply handler
    ├── pane-map.ts     # In-memory pane_id → thread mapping with TTL cleanup
    ├── tmux.ts         # tmux send-keys wrapper with reply normalization
    └── types.ts        # Shared TypeScript interfaces

hooks/
└── notify-slack.sh     # Claude Code hook for Notification + Stop events
```
