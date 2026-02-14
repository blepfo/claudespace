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
- [x] Notification events: enrich with tool details from transcript (Bash command, file paths, AskUserQuestion options)
- [x] Fix jq `last` on empty array — use `.[-1]` (returns `null` safely)

### Bridge (`server.ts`)
- [x] Stop messages: bold `*Claude finished:*` header + full text (was: `Claude finished: {truncated}`)
- [x] Notification messages: pass through as-is (hook handles Slack formatting)

## Future
- [ ] Slash commands in Slack for claudespace operations (`/cspace list`, etc.)
- [ ] Multi-session support
- [ ] Remove debug `app.event("message")` listener once stable
