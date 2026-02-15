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

Claude Code automatically writes a JSONL transcript for every session at `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Each line is a JSON object with a `type` field (`assistant`, `user`, `system`, `progress`, `file-history-snapshot`). Assistant entries have `.message.content` arrays containing `text` and `tool_use` blocks. All hook events (Stop, Notification) include `transcript_path` in the payload.

### Tiered enrichment strategy for notifications

The hook uses a three-tier approach, falling through if the previous tier produces nothing:

1. **Transcript enrichment** (structured data for known tools): Parses the last `tool_use` block from the transcript. A `format_tool_detail` function dispatches on tool name:
   - Bash: description + command in a code block
   - Edit/Write/Read: file path in inline code
   - AskUserQuestion: question text + options as a bullet list
   - ExitPlanMode: reads the plan file from disk (finds the last Write/Edit file path in the transcript)
2. **Pane capture** (fallback for unhandled tools): `tmux capture-pane` grabs the visible terminal content. Used for idle prompts and any future tool types not yet in the case statement.

### Stop event extraction

Extracts ALL text blocks from the last assistant message (not just the last block), joined with double newlines. Cap at 8000 chars. The bridge prepends a bold `*Claude finished:*` header. A 0.3s sleep before reading handles a race condition where the Stop hook fires before the final transcript entry is flushed to disk.

### Notification payload fields

All Notification events include: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `message`, `notification_type`. The `notification_type` values observed: `idle_prompt`, `permission_prompt`. The `message` field is terse (e.g., "Claude Code needs your attention") — hence the need for enrichment.

### jq learnings

- `[]?` (try operator) can silently suppress output — use `select(.field)` guard instead
- Must use `jq -s` (slurp) to process JSONL as an array
- `last` on empty array errors in some jq versions — use `.[-1]` instead (returns `null` safely)
- Transcript also contains `progress`, `system`, `file-history-snapshot` entries — always filter with `select(.type == "assistant" and .message.content)`

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

## Session-scoped Thread Keys

Thread map keys changed from bare `name` (e.g., `"main"`) to `session/name` (e.g., `"claudespace/main"`). Without this, two claudespace sessions for different repos with a pane named `main` would collide — `claudespace connect` in one session would steal the other's thread. The `session` field is the tmux session name (`$CSPACE_SESSION`), added to all request types and stored in `PaneMapping` and `ThreadRecord`.

**Migration**: Old bare-name entries in `thread-map.json` won't match new `session/name` lookups. They're treated as missing — `claudespace connect` creates new threads. No migration code; old entries sit inert.

## JSON Construction in Shell: jq -n over Embedded Substitution

The hook script originally built curl JSON payloads by embedding `$(jq -Rs .)` output inside bash double-quoted strings. This had a latent bug: `jq` output contains `\"` for escaped quotes, but bash's double-quote processing strips the backslashes, producing invalid JSON. The bug was triggered when the message contained double quotes (e.g., from pane captures with terminal UI content).

**Fix**: Use `jq -n --arg` to construct the entire JSON payload, piped directly to `curl -d @-`. This avoids bash string interpretation entirely.

## Backticks in Bash Double-Quoted Strings

Triple backticks (` ``` `) inside bash double-quoted strings (`"` ``` `"`) are interpreted as command substitution, not literal characters. The first pair forms an empty substitution, the third backtick opens a new substitution that consumes subsequent text. This causes silent script failures under `set -e`.

**Fix**: Place backticks inside `$'...'` (ANSI-C quoting) where they have no special meaning: `$'\n```\n'` produces a literal newline + three backticks + newline.

## Pane Capture: Permission Prompts vs AskUserQuestion

Both `permission_prompt` (Bash, Edit) and `AskUserQuestion` fire as `notification_type: permission_prompt`. The hook uses different enrichment for each:

- **Bash/Edit/etc.**: Structured detail (command/file) + last 15 lines of pane capture (shows Yes/No/Always options)
- **AskUserQuestion**: Pane capture only (no structured detail). The `format_tool_detail` AskUserQuestion handler intentionally produces empty output so the pane capture fallback runs, showing the complete UI including dynamically-added options like "Chat about this" that aren't in the tool_use input.

## Large Text Paste: load-buffer over send-keys

For multi-line or >200-char Slack replies, `tmux send-keys -l` triggers Claude Code's paste detection, showing `[Pasted text #1 + N lines]`. The subsequent Enter may not submit. **Fix**: Use `tmux load-buffer` from stdin + `paste-buffer -d` + 200ms sleep + `send-keys Enter`. Short single-line text continues to use `send-keys -l`.

## Slack Reply Limitations with AskUserQuestion

Slack replies to AskUserQuestion prompts must use the **option number** (1, 2, 3), not the option text. The AskUserQuestion TUI widget responds to number keys and arrow keys; arbitrary text is ignored and Enter confirms the default (first) option. This is a known limitation of the text-based Slack→tmux interaction.
