# Slack Bridge Reconnection

## Goal

Add a mechanism to reconnect claudespace panes to Slack threads when the bridge loses track of mappings. This happens when:

1. **Bridge server restarts** — in-memory mappings are lost, panes and threads still exist
2. **Pane predates bridge** — `claudespace add` ran before `claudespace slack start`
3. **Unknown disconnect** — mapping lost for any other reason

## Design

### Core Idea: Persistent Thread Map

Add a JSON file that maps worktree **names** to Slack **thread timestamps**. This survives bridge restarts and enables reconnection. The name is the stable identifier — pane IDs are ephemeral (change on hide/re-add), but thread_ts is durable.

Two data stores, separate concerns:

| Store | Key | Purpose | Lifetime |
|---|---|---|---|
| Active map (existing, in-memory) | `pane_id` | Route notifications + replies to panes | Cleared on bridge restart |
| Thread map (new, persisted to disk) | `name` | Remember which thread belongs to which worktree | Survives restarts |

### Persistent store: `data/thread-map.json`

```json
{
  "feature-x": {
    "name": "feature-x",
    "thread_ts": "1234567890.123456",
    "channel_id": "C01234567"
  }
}
```

Written on every `/thread` and `/connect` call. Read on startup and on `/connect`.

### New endpoint: `POST /connect`

```
POST /connect
{ "pane_id": "%5", "name": "feature-x" }

Response: { "ok": true, "thread_ts": "...", "reconnected": true }
```

Logic:
1. Look up `name` in persistent thread map
2. **Found** → create active mapping with new pane_id, post "Reconnected (pane %5)" to existing thread
3. **Not found** → create new thread (same as `/thread`), persist it
4. Return `{ ok, thread_ts, reconnected }`

### New command: `claudespace connect [name...]`

```bash
claudespace connect              # connect all active claude:* panes
claudespace connect feature-x    # connect just this one
```

Flow:
1. Check bridge health (`curl /health`). If down → print error, exit
2. Enumerate targets:
   - With args: use those names
   - Without args: list all `claude:*` panes from tmux
3. For each name: find its pane_id via `find_claude_pane`, call `POST /connect`
4. Print result (reconnected vs new thread)

### Unmapped thread warning

When a user replies in a Slack thread that has no active mapping:

1. Check persistent thread map for this `thread_ts`
2. **Found** → post: "This session (*feature-x*) is disconnected from the bridge. Run `claudespace connect feature-x` to reconnect."
3. **Not found** → ignore silently (unknown thread, probably not ours)
4. Track warned `thread_ts` values in a `Set` to avoid spamming the same message on every reply

### Modified existing endpoints

**`POST /thread`** (existing, modified):
- After creating thread, also write to persistent store
- No other behavior change

**`POST /close`** (existing, modified):
- Add optional `permanent` field to request body
- `permanent: false` (default): remove active mapping, **keep** persistent mapping (thread can be reconnected later)
- `permanent: true`: remove from both (used by `claudespace delete`, where the worktree is destroyed)

### Modified `claudespace` commands

**`cmd_add`** — no change (continues to use `/thread`)
**`cmd_hide`** — no change (already calls `/close` without permanent flag)
**`cmd_delete`** — pass `"permanent": true` in `/close` body

## Scope

### In scope
- Persistent thread map (JSON file)
- `POST /connect` endpoint
- `claudespace connect` command
- Unmapped thread warning in Slack
- `permanent` flag on `/close`
- Tab completion for `connect` command

### Out of scope
- Auto-reconnect on bridge startup (too magical, prefer explicit `claudespace connect`)
- SQLite or database storage (JSON file is sufficient for this scale)
- Reconnecting to threads from previous `claudespace kill` sessions

## File changes

### Bridge (`claude-slack-bridge/`)
- **New**: `src/persistence.ts` — read/write `data/thread-map.json`
- **Modify**: `server.ts` — add `POST /connect`, persist on `/thread`, `permanent` flag on `/close`
- **Modify**: `slack.ts` — warn on unmapped thread reply
- **Modify**: `types.ts` — add `ConnectRequest`, update `CloseRequest`
- **Modify**: `.gitignore` — add `data/`

### CLI (`claudespace`)
- **Add**: `cmd_connect` function
- **Modify**: `cmd_delete` — add `permanent` to `/close` call
- **Modify**: completions, help text
