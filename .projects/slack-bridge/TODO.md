# Slack Bridge TODO

## Implementation (done)
- [x] Bridge server: types, config, pane-map, tmux, slack, server, index
- [x] Hook script: `hooks/notify-slack.sh` (handles Notification + Stop)
- [x] claudespace modifications: `cmd_add` → `/thread`, `cmd_hide` → `/close`, `cmd_delete` → `/close`
- [x] Claude Code hooks in `~/.claude/settings.json`
- [x] `.gitignore` for `node_modules/`, `dist/`, `.env`
- [x] `npm install` — dependencies verified, TypeScript compiles clean
- [x] `claudespace slack [start|stop]` command
- [x] Symlink install instructions in main README

## Bugs fixed during initial testing
- [x] Stop event: extract last assistant message from transcript JSONL (not hardcoded)
- [x] jq `[]?` silently suppresses output — use `select(.message.content)` guard instead
- [x] jq streaming mode produces multiline output — use `jq -s` (slurp) for reliable last-match extraction
- [x] `tmux send-keys -- 'text' Enter` sends literal "Enter" — use `-l` flag + separate `send-keys Enter`
- [x] Slack requires both OAuth scopes AND event subscriptions (separate config sections)
- [x] Bot must be `/invite`d to the channel (`not_in_channel` error)

## Setup (user action required)
- [x] Create Slack app with Socket Mode, scopes, and event subscriptions
- [x] Copy `.env.example` → `.env`, fill in tokens
- [x] Verify `jq` is installed
- [x] Test end-to-end: thread creation, notifications, reply routing

## Reconnection (done)

See [reconnect/README.md](reconnect/README.md) for design.

### Bridge changes
- [x] `src/persistence.ts` — read/write `data/thread-map.json` (name → thread_ts)
- [x] Modify `server.ts` — `POST /connect` endpoint (reconnect or create thread)
- [x] Modify `server.ts` — persist thread_ts on `/thread` creation
- [x] Modify `server.ts` — `permanent` flag on `POST /close` (delete persistent mapping)
- [x] Modify `slack.ts` — warn in-thread on reply to unmapped thread (with dedup Set)
- [x] Modify `types.ts` — `ConnectRequest`, update `CloseRequest` with `permanent`
- [x] Add `data/` to `.gitignore`

### CLI changes
- [x] `cmd_connect [name...]` — call `POST /connect` for specified or all active panes
- [x] Modify `cmd_delete` — pass `"permanent": true` in `/close` body
- [x] Update completions and help text

### Testing
- [ ] Test `claudespace connect` with bridge running (should create new threads)
- [ ] Test bridge restart → `claudespace connect` (should reconnect to existing threads)
- [ ] Test Slack reply to disconnected thread (should warn with reconnect instructions)
- [ ] Test `claudespace delete` clears persistent mapping
- [ ] Test `claudespace hide` + `claudespace connect` reconnects to same thread

## Richer Slack Messages (done)

### Hook script (`hooks/notify-slack.sh`)
- [x] Stop events: extract ALL text blocks from last assistant message (was: last block only, truncated to 500 chars)
- [x] Stop events: cap at 8000 chars instead of 500
- [x] Stop events: `sleep 0.3` before reading transcript (race condition — hook fires before final entry is flushed)
- [x] Notification events: tiered enrichment — transcript parsing → pane capture fallback
- [x] Notification enrichment for Bash (description + command), Edit/Write/Read (file path), AskUserQuestion (question + options)
- [x] ExitPlanMode: reads plan file from disk (finds last Write/Edit path in transcript)
- [x] Pane capture fallback for unhandled tools (strips trailing blank lines)
- [x] Fix jq `last` on empty array — use `.[-1]` (returns `null` safely)
- [x] Refactor: helpers (`last_tool_use`, `last_assistant_text`, `capture_pane`, `format_tool_detail`, `truncate_message`), clear section structure

### Bridge (`server.ts`)
- [x] Stop messages: bold `*Claude finished:*` header + full text as mrkdwn (no code block — content is narrative prose that may contain backticks)
- [x] Notification messages: pass through as-is (hook handles Slack formatting)

## Session Scoping (done)
- [x] Add `session` field to all request types (`CreateThreadRequest`, `ConnectRequest`, `NotifyRequest`, `CloseRequest`)
- [x] Add `session` to `PaneMapping` and `ThreadRecord`
- [x] Composite key (`session/name`) in persistent thread map
- [x] All bridge endpoints extract and pass through `session`
- [x] Slack thread titles include session: `*[claudespace] main*`
- [x] All 4 claudespace curl calls include `"session":"${CSPACE_SESSION}"`
- [x] Hook script gets session via `tmux display-message '#{session_name}'`
- [x] Auto-reconnect in `/notify` endpoint (reconnects from persistent map if active mapping lost)
- [x] Disconnect warning includes session name

## Hook Fixes (done)
- [x] Fix JSON construction: use `jq -n --arg` piped to `curl -d @-` (was: embedded `$(jq -Rs .)` in double-quoted string — broken by quotes in message)
- [x] Fix backticks in bash: use `$'\n```\n'` ANSI-C quoting (was: `"```"` — interpreted as command substitution)
- [x] Permission prompt pane capture: last 15 lines for Yes/No/Always options
- [x] AskUserQuestion: use pane capture (not structured detail) — shows all options including "Chat about this"

## Large Text Paste (done)
- [x] Multi-line or >200-char text: use `tmux load-buffer` + `paste-buffer` instead of `send-keys -l`
- [x] 200ms sleep between paste and Enter for Claude Code to process

## Future
- [ ] Verify Stop event `sleep 0.3` is sufficient (or find a better flush signal)
- [ ] Slash commands in Slack for claudespace operations (`/cspace list`, etc.)
- [ ] Remove debug `app.event("message")` listener once stable
