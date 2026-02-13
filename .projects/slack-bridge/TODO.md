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

## Future
- [ ] Persistent mapping storage (SQLite or file-based)
- [ ] Rich Slack message formatting (Block Kit)
- [ ] Slash commands in Slack for claudespace operations (`/cspace list`, etc.)
- [ ] Multi-session support
- [ ] Remove debug `app.event("message")` listener once stable
