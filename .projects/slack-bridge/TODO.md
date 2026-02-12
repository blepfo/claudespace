# Slack Bridge TODO

## Implementation (done)
- [x] Bridge server: types, config, pane-map, tmux, slack, server, index
- [x] Hook script: `hooks/notify-slack.sh` (handles Notification + Stop)
- [x] claudespace modifications: `cmd_add` → `/thread`, `cmd_hide` → `/close`, `cmd_delete` → `/close`
- [x] Claude Code hooks in `~/.claude/settings.json`
- [x] `.gitignore` for `node_modules/`, `dist/`, `.env`
- [x] `npm install` — dependencies verified, TypeScript compiles clean

## Setup (user action required)
- [ ] Create Slack app with Socket Mode, `chat:write` scope, `message.channels` event subscription
- [ ] Copy `claude-slack-bridge/.env.example` → `.env`, fill in `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`
- [ ] Verify `jq` is installed (`brew install jq` if not)
- [ ] Test: `cd claude-slack-bridge && npm run dev`, then `curl localhost:7890/health`

## Testing
- [ ] Verify thread creation: `claudespace add test1` → thread appears in Slack
- [ ] Verify notification: trigger Claude notification → message in thread
- [ ] Verify reply routing: reply in Slack thread → keystroke arrives in pane
- [ ] Verify close: `claudespace hide` / `claudespace delete` → closing message in thread
- [ ] Graceful degradation: stop bridge → `claudespace add` still works normally

## Future
- [ ] Persistent mapping storage (SQLite or file-based)
- [ ] Rich Slack message formatting (Block Kit)
- [ ] Slash commands in Slack for claudespace operations (`/cspace list`, etc.)
- [ ] Multi-session support
- [ ] Auto-start bridge with claudespace init
