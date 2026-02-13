# .projects/ - Project Context Directory

## Purpose

This directory contains project-specific context and state to support:

1. **Agent Continuity** - Claude/agents can save and reuse context across sessions, pick up where they left off, and discover next steps
2. **Handoffs** - Context can be handed off between sessions (or between worktree instances) with all necessary context intact

## Structure

Each subdirectory represents an active or recent project:

```
.projects/
├── CLAUDE.md                    # This file
├── <project_name>/              # Individual project directory
│   ├── README.md               # Goal + quick overview
│   ├── TODO.md                 # Current tasks, status, blockers
│   ├── DECISIONS.md            # Decision log with rationale
│   └── context/                # Supporting materials
│       ├── notes.md
│       ├── research.md
│       └── ...
```

## File Conventions

### README.md
- **Goal**: What we're trying to achieve (the "why")
- **Overview**: Quick context at-a-glance
- **Scope**: What's in/out of scope

### TODO.md
- **Current Status**: Where we are now
- **Next Steps**: Actionable items (use checkboxes: `- [ ]`)
- **Blockers**: What's preventing progress
- **Recent Progress**: What just got done

### DECISIONS.md
- **Decision Log**: What we decided, when, and why
- **Format**: Append-only, date-stamped entries
- **Include**: Context, alternatives considered, rationale
- **Purpose**: Prevent revisiting settled questions, explain "why" to future readers

### context/
- **Purpose**: Supporting materials that don't fit elsewhere
- **Examples**: Research notes, shell output captures, design sketches
- **Organization**: Use subdirectories or dated files as needed

## Usage Guidelines

### For Humans
- **Starting a new project?** Create a directory and at minimum a README.md with the goal
- **Picking up existing work?** Read README.md -> TODO.md -> DECISIONS.md in that order
- **Finishing a session?** Update TODO.md with progress and next steps
- **Made a key decision?** Document it in DECISIONS.md before you forget why

### For Claude/Agents
- **Session start**: Read README.md for goals, TODO.md for current state
- **During work**: Update TODO.md as tasks complete, add to DECISIONS.md when making choices
- **Session end**: Leave clear next steps in TODO.md for continuity
- **Discovery**: Use context/ to save research findings or intermediate artifacts

## Best Practices

1. **Keep it current** - Stale docs are worse than no docs
2. **Link to code** - Use relative paths: `[claudespace:142](../../claudespace#L142)`
3. **Be specific** - "Fix pane bug" -> "Fix column rebalancing when hiding middle pane at claudespace:380"
4. **Date decisions** - Start each DECISIONS.md entry with `## YYYY-MM-DD: Decision title`
5. **Archive when done** - Move completed projects to `.projects/archive/` or delete if no longer relevant

## Maintenance

- **Active projects**: Keep updated as work progresses
- **Completed projects**: Archive or delete (info should be in git history)
- **Abandoned projects**: Delete or move to archive with a note about why

---

*This directory is version-controlled. Commit changes to project docs along with related code changes.*
