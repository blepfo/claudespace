# claudespace

A single-window tmux workspace for running multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) instances in parallel using git worktrees.

```
┌──────────────┬───────────────┬────────────────┐
│ claude       │ claude        │ claude         │
│ (worktree 1) │ (worktree 2)  │ (worktree 3)  │
├──────────────┼───────────────┼────────────────┤
│ shell        │ shell         │ shell          │
│ (worktree 1) │ (worktree 2)  │ (worktree 3)  │
└──────────────┴───────────────┴────────────────┘
```

Each column is a git worktree with a Claude Code instance on top and a shell below. Columns can be added, hidden, and deleted independently.

Worktrees are stored at `~/.claude-worktrees/<repo>/`, which is the same location Claude Desktop uses — so worktrees created by either tool appear in both.

## Prerequisites

- [tmux](https://github.com/tmux/tmux) (3.1+)
- [git](https://git-scm.com/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

## Installation

Copy the script to somewhere on your `$PATH`:

```bash
curl -o ~/.local/bin/claudespace https://raw.githubusercontent.com/blepfo/claudespace/main/claudespace
chmod +x ~/.local/bin/claudespace
```

### Tab completion

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
eval "$(claudespace completions)"
```

## Usage

### Start a session

```bash
cd your-repo
claudespace init
```

This creates a tmux session and attaches to it. From here, add worktree columns.

### Add a worktree column

```bash
claudespace add feature-x          # branch from HEAD
claudespace add bugfix develop      # branch from develop
```

Creates a git worktree, opens Claude Code in the top pane, and a shell in the bottom pane. If the worktree already exists (e.g., previously hidden), it reuses it.

### Hide a column

```bash
claudespace hide feature-x
```

Kills the tmux panes but keeps the worktree on disk. You can re-add it later with `claudespace add feature-x`.

### Delete a column

```bash
claudespace delete feature-x
```

Kills panes, removes the git worktree, and deletes the branch. Prompts for confirmation.

### Deploy a worktree to a branch

From a worktree's shell pane:

```bash
claudespace deploy develop       # rebase onto develop and fast-forward merge
claudespace deploy main          # rebase onto main instead
```

Auto-detects the current worktree from your working directory. Rebases the worktree's branch on top of the target, then fast-forward merges it. Refuses to run if the worktree has uncommitted changes. Does not push automatically — prints the push command for you to run.

### Move a column

```bash
claudespace move left    # Swap current column with the one to its left
claudespace move right   # Swap current column with the one to its right
```

Wraps around at the edges. Works from any pane in the column.

### Rename a column

```bash
claudespace rename my-feature
```

Re-tags the current column's panes to `claude:my-feature` and `shell:my-feature`. Useful after manually splitting a pane or to correct a column's identity.

### Other commands

```bash
claudespace balance     # Resize panes to equal grid
claudespace list        # Show active columns
claudespace attach      # Reattach to the session
claudespace kill        # Kill the tmux session
```

Running `add`, `hide`, `delete`, or `deploy` without a name shows available worktrees as suggestions.

## .worktreeinclude

Create a `.worktreeinclude` file in your repo root to list gitignored files that should be copied into new worktrees (e.g., `.env`, `local_data/`). One pattern per line, comments with `#`.

```
# .worktreeinclude
.env
.env.local
local_data/
```

This replicates what Claude Desktop does automatically when creating worktrees.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CSPACE_SESSION` | `claudespace` | tmux session name |
| `CSPACE_WT_DIR` | `~/.claude-worktrees/<repo>` | Worktree parent directory |

## How it works

- Each worktree column is a pair of tmux panes (claude + shell) arranged vertically within a column.
- Panes are tracked using tmux user-defined options (`@cspace`), which are immune to applications overwriting pane titles.
- When adding columns beyond the first, claudespace restructures the tmux pane tree (break shell panes out, add the column, rejoin) to ensure proper side-by-side layout.
- Moving columns uses geometry-based detection (pane x/y positions) rather than tags, so it works reliably even with manually created panes.
