# Slack Bridge Decisions

## Socket Mode over Webhooks
Socket Mode avoids exposing a public URL. The bridge runs locally alongside the tmux session, so there's no need for ingress. Socket Mode also simplifies development—no ngrok or tunneling required.

## In-memory Mapping
Pane-to-thread mappings are stored in a `Map` with TTL cleanup. Sessions are ephemeral (destroyed on `claudespace kill`), so persistence adds complexity with minimal benefit. The 24h TTL handles stale entries from crashes. *(Superseded by "Reconnection: Two Separate Maps" below — active map stays in-memory, but a persistent thread map is added alongside it.)*

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

## tmux send-keys: -l flag + separate Enter
Text is sent with `tmux send-keys -l` (literal mode), then `Enter` is sent in a separate `send-keys` call. The original approach used `send-keys -- 'text' Enter`, but `--` makes everything after it literal — including `Enter`, which was typed as the string "Enter" instead of pressing the Enter key. The `-l` flag on the first call prevents the text from being interpreted as key names (e.g., a message containing "Enter" or "Escape" won't trigger those keys).

## Hook Transcript Extraction
All hook events (Stop, Notification) include `transcript_path` in the payload, pointing to the session's JSONL transcript.

**Stop events** extract ALL text blocks from the last assistant message (not just the last one), joined with double newlines. Cap at 8000 chars. The bridge prepends a bold `*Claude finished:*` header.

**Notification events** parse the transcript for the last `tool_use` block and enrich the terse notification message with details:
- Bash: description + command in a code block
- Edit/Write/Read: file path in inline code
- AskUserQuestion: question text + options as a bullet list

Key jq learnings:
- `jq`'s `[]?` (try operator) can silently suppress output — use `select(.message.content)` guard instead
- Must use `jq -s` (slurp) to process multiple JSONL lines as an array
- `last` on empty array errors in some jq versions — use `.[-1]` instead (returns `null` safely)
- Notification `notification_type` field: `idle_prompt`, `permission_prompt`

## Slack App Setup: Scopes vs Event Subscriptions
Slack requires BOTH OAuth scopes AND event subscriptions — they're configured in separate sections and both are required. `channels:history` (OAuth scope) grants permission to read messages, but `message.channels` (event subscription) is what actually triggers the bot to receive message events. Missing either one results in silent failure — Socket Mode connects fine but no events arrive. The app must be reinstalled after changing scopes.

## Reconnection: Two Separate Maps

The reconnection design uses two separate data stores rather than adding persistence to the existing in-memory map:

1. **Active map** (existing, in-memory, keyed by `pane_id`) — routes notifications and replies to live panes. Cleared on bridge restart. This is the hot path.
2. **Thread map** (new, persisted to `data/thread-map.json`, keyed by `name`) — remembers which Slack thread belongs to which worktree. Survives restarts.

Why separate: `pane_id` is ephemeral (changes on hide/re-add, meaningless after restart), but `name` is stable (the worktree name persists). The thread map captures the durable relationship (name↔thread), while the active map captures the transient one (pane↔thread).

## Reconnection: Explicit over Automatic

The bridge does NOT auto-reconnect on startup. The user runs `claudespace connect` explicitly. Reasons:
- Predictable — user controls when connections are re-established
- Simple — no startup reconciliation logic (checking which panes still exist, handling stale threads)
- Matches existing pattern — `claudespace add` creates connections, `claudespace connect` restores them

## Reconnection: `/connect` vs Modifying `/thread`

`POST /connect` is a new endpoint rather than changing `/thread` behavior. `cmd_add` continues to use `/thread` (always creates a new thread). This keeps the semantics clear: `add` = new session = new thread; `connect` = reconnect to existing thread if possible. The persistent store is updated by both.

## Reconnection: `/close` Permanent Flag

`POST /close` gains an optional `permanent` boolean. Default false (hide) keeps the thread in the persistent store so it can be reconnected. `permanent: true` (delete) removes it entirely, since the worktree is being destroyed. This avoids stale thread records accumulating for deleted worktrees.

## Reconnection: Unmapped Thread Warning (Dedup)

When a Slack reply arrives for an unmapped thread, the bridge posts a warning to the thread with reconnection instructions. A `Set<thread_ts>` tracks which threads have been warned to avoid spamming on every reply. The Set is in-memory only — restarting the bridge resets it, which is fine (one warning per restart per thread is acceptable).
