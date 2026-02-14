#!/usr/bin/env bash
# Claude Code hook for Notification and Stop events.
# Posts to the claude-slack-bridge server running on localhost.
# Always exits 0 so hook failures never block Claude Code.

set -euo pipefail

BRIDGE_PORT="${BRIDGE_PORT:-7890}"

# Read hook JSON from stdin
input=$(cat)

# Not in tmux — nothing to do
if [[ -z "${TMUX_PANE:-}" ]]; then
  exit 0
fi

# Look up the @cspace tag for this pane
tag=$(tmux display-message -p -t "$TMUX_PANE" '#{@cspace}' 2>/dev/null || true)

# Only act on claude panes
if [[ "$tag" != claude:* ]]; then
  exit 0
fi

name="${tag#claude:}"

# Extract event name from hook JSON
event=$(echo "$input" | jq -r '.hook_event_name // empty' 2>/dev/null || true)

if [[ "$event" == "Notification" ]]; then
  message=$(echo "$input" | jq -r '.message // "Notification"' 2>/dev/null || echo "Notification")
  type="notification"

  # Enrich with tool details from transcript
  transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    tool_json=$(tail -200 "$transcript" \
      | jq -s '[.[] | select(.type == "assistant" and .message.content) | .message.content[] | select(.type == "tool_use")] | .[-1]' 2>/dev/null) || true

    if [[ -n "$tool_json" && "$tool_json" != "null" ]]; then
      tool_name=$(echo "$tool_json" | jq -r '.name // empty')
      detail=""
      case "$tool_name" in
        Bash)
          desc=$(echo "$tool_json" | jq -r '.input.description // empty')
          cmd=$(echo "$tool_json" | jq -r '.input.command // empty')
          if [[ -n "$cmd" ]]; then
            [[ -n "$desc" ]] && detail="$desc"$'\n'
            detail="${detail}"$'```\n'"$cmd"$'\n```'
          fi
          ;;
        Edit|Write|Read)
          file=$(echo "$tool_json" | jq -r '.input.file_path // empty')
          [[ -n "$file" ]] && detail="\`$file\`"
          ;;
        AskUserQuestion)
          detail=$(echo "$tool_json" | jq -r '
            .input.questions[]? |
            .question + "\n" + ([.options[]? | "  \u2022 " + .label + " \u2014 " + .description] | join("\n"))
          ' 2>/dev/null) || true
          ;;
      esac
      [[ -n "$detail" ]] && message="${message}"$'\n'"${detail}"
    fi
  fi

elif [[ "$event" == "Stop" ]]; then
  transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
  message=""
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    # Extract ALL text blocks from the last assistant message
    message=$(tail -200 "$transcript" \
      | jq -s -r '
        [.[] | select(.type == "assistant" and .message.content)
         | [.message.content[] | select(.type == "text") | .text]
         | join("\n\n") | select(length > 0)
        ] | .[-1] // empty
      ' 2>/dev/null) || true
    # Cap at 8000 chars (Slack collapses long code blocks)
    if [[ ${#message} -gt 8000 ]]; then
      message="${message:0:8000}…(truncated)"
    fi
  fi
  : "${message:=Task completed}"
  type="stop"
else
  exit 0
fi

# Post to bridge (background, fail-silent)
curl -sf -X POST "http://localhost:${BRIDGE_PORT}/notify" \
  -H 'Content-Type: application/json' \
  -d "{\"pane_id\":\"${TMUX_PANE}\",\"name\":\"${name}\",\"message\":$(echo "$message" | jq -Rs .),\"type\":\"${type}\"}" \
  >/dev/null 2>&1 &

exit 0
