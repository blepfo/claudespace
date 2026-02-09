# CLAUDE.md

## Overview

claudespace is a single-file bash script (~560 lines) that manages a tmux session with multiple Claude Code instances running in parallel via git worktrees.

## Architecture

The script is organized into three sections:

1. **Helpers** — Pure functions for paths, tmux queries, and worktree listing
2. **Commands** — `cmd_init`, `cmd_add`, `cmd_hide`, `cmd_delete`, `cmd_deploy`, `cmd_list`, `cmd_attach`, `cmd_kill`, `cmd_completions`
3. **Main** — Case statement dispatch

### Key design decisions

**Pane tracking with `@cspace`:** Panes are identified using tmux per-pane user options (`set-option -p @cspace`), not pane titles. Claude Code overwrites pane titles via terminal escape sequences, making title-based tracking unreliable. The `_tag_pane` helper sets both `@cspace` (for programmatic lookup) and the pane title (for visual display in borders).

**Pane tree restructuring on column add:** tmux pane splits are hierarchical — splitting a pane that's already in a vertical split creates a nested layout, not proper columns. When adding the 2nd+ column, the script:
1. Breaks all shell panes out to temporary windows (`break-pane -d`)
2. Splits the last claude pane horizontally (now in a flat row, this creates a proper sibling column)
3. Rejoins each shell pane below its claude pane (`join-pane`)
4. Splits the new column for its shell pane

This produces the correct column layout regardless of how many columns exist.

**Worktree location:** Defaults to `~/.claude-worktrees/<repo>/` to match Claude Desktop's convention, so worktrees appear in both tools.

**`.worktreeinclude`:** Copies gitignored files (`.env`, `local_data/`, etc.) into new worktrees, replicating Claude Desktop behavior.

**Deploy via rebase + fast-forward:** `cmd_deploy` rebases the worktree branch onto the target, then fast-forward merges. If the main repo is already on the target branch, it uses `git merge --ff-only`. If it's on a different branch, it uses `git update-ref` to advance the target ref without switching checkouts. Does not auto-push.

## Conventions

- Bash with `set -euo pipefail`
- All tmux queries use `#{@cspace}` format, never `#{pane_title}`
- Pane roles: `terminal`, `claude:<name>`, `shell:<name>`
- Tab completion via `claudespace completions` (outputs a bash `complete` script)
- Commands show suggestions when run without required args (e.g., `claudespace hide` lists active worktrees)

## Testing

No automated tests. Test manually:

```bash
cd any-git-repo
claudespace init              # creates session, attaches
claudespace add test1         # first column (repurposes terminal pane)
claudespace add test2         # second column (restructures pane tree)
claudespace add test3         # third column
claudespace list              # verify all columns visible
claudespace hide test2        # verify middle column removed, others rebalance
claudespace add test2         # verify re-add works
claudespace deploy test2 develop  # verify rebase + fast-forward merge onto develop
claudespace delete test3      # verify prompts, cleans up worktree + branch
claudespace kill              # verify session destroyed
```

Key things to verify:
- Columns are side-by-side (not stacked or T-shaped)
- `claudespace hide` finds both claude and shell panes (claude pane title gets overwritten by the CLI, but `@cspace` option persists)
- Adding after hiding works correctly
- Shell panes are 30% height, claude panes are 70%
- `claudespace deploy` rebases and fast-forwards correctly, refuses on dirty worktree, prints rebase conflict instructions on failure
