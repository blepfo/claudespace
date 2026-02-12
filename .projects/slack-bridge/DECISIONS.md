# Slack Bridge Decisions

## Socket Mode over Webhooks
Socket Mode avoids exposing a public URL. The bridge runs locally alongside the tmux session, so there's no need for ingress. Socket Mode also simplifies development—no ngrok or tunneling required.

## In-memory Mapping
Pane-to-thread mappings are stored in a `Map` with TTL cleanup. Sessions are ephemeral (destroyed on `claudespace kill`), so persistence adds complexity with minimal benefit. The 24h TTL handles stale entries from crashes.

## Single Hook Script for Both Events
One `notify-slack.sh` handles both Notification and Stop events. The script reads `hook_event_name` from the JSON payload and adjusts the message accordingly. This keeps hook configuration simple (same command for both event types).

## Background curl in claudespace
All bridge calls from the claudespace bash script use `curl ... &` (backgrounded, fail-silent). This ensures claudespace never blocks or errors if the bridge is down. The bridge is strictly optional.

## Reply Mapping (y/yes/ok → y)
Slack replies are normalized before sending to tmux. Common affirmatives map to `y` and negatives to `n`, matching Claude Code's permission prompts. Raw text is sent verbatim for freeform input.

## Express + Bolt Coexistence
The bridge runs both a Bolt Socket Mode app (for receiving Slack messages) and an Express server (for receiving HTTP posts from claudespace/hooks). They share the same process but serve different roles.

## dotenv for .env Loading
`config.ts` imports `dotenv/config` at the top, which auto-loads `.env` from the working directory. This means the bridge must be started from inside `claude-slack-bridge/` (or `DOTENV_CONFIG_PATH` must be set). The `.env` file is gitignored; `.env.example` is committed as a template.

## Hook Script Dependencies
The hook script (`hooks/notify-slack.sh`) requires `jq` for JSON parsing and `curl` for HTTP posting. These are runtime dependencies not managed by npm. The script uses `jq -Rs` to safely JSON-encode the notification message (handles quotes, newlines, etc. in Claude's output).

## Pane ID Validation
Pane IDs are validated against `/^%\d+$/` in `pane-map.ts` and `tmux.ts`. tmux pane IDs always have this format (e.g., `%0`, `%12`). This prevents shell injection through malformed IDs passed to `tmux send-keys`.

## Hooks in Global Settings
Hooks are configured in `~/.claude/settings.json` (global), not per-project. This means the hook fires for all Claude Code sessions, not just claudespace ones. The hook script handles this by checking `$TMUX_PANE` and the `@cspace` tag — it exits early if not in a claudespace pane.

## TypeScript Module Resolution
Uses `NodeNext` module resolution with `.js` extensions in imports (e.g., `import { config } from "./config.js"`). This is required by Node.js ESM — TypeScript resolves `.js` imports to `.ts` files during compilation, and the emitted `.js` files use the same `.js` extensions that Node needs at runtime.
