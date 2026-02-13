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
elif [[ "$event" == "Stop" ]]; then
  transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
  message=""
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    # Slurp last 100 JSONL lines, find the last assistant text block
    message=$(tail -100 "$transcript" \
      | jq -s -r '[.[] | select(.type == "assistant" and .message.content) | [.message.content[] | select(.type == "text") | .text] | last // empty | select(length > 0)] | last // empty' 2>/dev/null) || true
    # Truncate to 500 chars for Slack readability
    if [[ ${#message} -gt 500 ]]; then
      message="${message:0:500}..."
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
