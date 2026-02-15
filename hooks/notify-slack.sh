#!/usr/bin/env bash
# Claude Code hook for Notification and Stop events.
# Posts to the claude-slack-bridge server running on localhost.
# Always exits 0 so hook failures never block Claude Code.

set -euo pipefail

BRIDGE_PORT="${BRIDGE_PORT:-7890}"

input=$(cat)

# --- Guards ---

[[ -z "${TMUX_PANE:-}" ]] && exit 0

tag=$(tmux display-message -p -t "$TMUX_PANE" '#{@cspace}' 2>/dev/null || true)
[[ "$tag" != claude:* ]] && exit 0

name="${tag#claude:}"
session=$(tmux display-message -p -t "$TMUX_PANE" '#{session_name}' 2>/dev/null || true)

# --- Shared setup ---

event=$(echo "$input" | jq -r '.hook_event_name // empty' 2>/dev/null || true)
transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)

# --- Helpers ---

# Extract the last tool_use block from recent transcript entries
last_tool_use() {
  [[ -z "$transcript" || ! -f "$transcript" ]] && return
  tail -200 "$transcript" \
    | jq -s '[.[] | select(.type == "assistant" and .message.content)
       | .message.content[] | select(.type == "tool_use")] | .[-1]' 2>/dev/null || true
}

# Extract all text from the last assistant message in the transcript
last_assistant_text() {
  [[ -z "$transcript" || ! -f "$transcript" ]] && return
  tail -200 "$transcript" \
    | jq -s -r '
      [.[] | select(.type == "assistant" and .message.content)
       | [.message.content[] | select(.type == "text") | .text]
       | join("\n\n") | select(length > 0)
      ] | .[-1] // empty
    ' 2>/dev/null || true
}

# Capture visible pane content, stripped of trailing blank lines.
# Optional arg: number of lines from the bottom (default: all).
capture_pane() {
  local lines="${1:-}"
  local text
  if [[ -n "$lines" ]]; then
    text=$(tmux capture-pane -p -t "$TMUX_PANE" -S "-${lines}" 2>/dev/null || true)
  else
    text=$(tmux capture-pane -p -t "$TMUX_PANE" 2>/dev/null || true)
  fi
  [[ -z "$text" ]] && return
  echo "$text" | awk '/[^[:space:]]/{p=NR} {a[NR]=$0} END{for(i=1;i<=p;i++) print a[i]}'
}

# Format tool_use details for Slack. Prints the detail string (empty if unhandled).
format_tool_detail() {
  local tool_json="$1"
  local tool_name
  tool_name=$(echo "$tool_json" | jq -r '.name // empty')

  case "$tool_name" in
    Bash)
      local desc cmd
      desc=$(echo "$tool_json" | jq -r '.input.description // empty')
      cmd=$(echo "$tool_json" | jq -r '.input.command // empty')
      if [[ -n "$cmd" ]]; then
        [[ -n "$desc" ]] && printf '%s\n' "$desc"
        printf '```\n%s\n```' "$cmd"
      fi
      ;;
    Edit|Write|Read)
      local file
      file=$(echo "$tool_json" | jq -r '.input.file_path // empty')
      [[ -n "$file" ]] && printf '`%s`' "$file"
      ;;
    AskUserQuestion)
      # Handled by pane capture — shows the complete UI including all options
      ;;
    ExitPlanMode)
      # Plan was written to a file before ExitPlanMode — read it directly
      local plan_file
      plan_file=$(tail -200 "$transcript" \
        | jq -s -r '[.[] | select(.type == "assistant" and .message.content)
           | .message.content[] | select(.type == "tool_use" and (.name == "Write" or .name == "Edit"))
           | .input.file_path] | .[-1] // empty' 2>/dev/null) || true
      if [[ -n "$plan_file" && -f "$plan_file" ]]; then
        cat "$plan_file" 2>/dev/null || true
      fi
      ;;
  esac
}

# --- Truncation ---

truncate_message() {
  local msg="$1" max="${2:-8000}"
  if [[ ${#msg} -gt $max ]]; then
    echo "${msg:0:$max}…(truncated)"
  else
    echo "$msg"
  fi
}

# --- Event handlers ---

if [[ "$event" == "Notification" ]]; then
  message=$(echo "$input" | jq -r '.message // "Notification"' 2>/dev/null || echo "Notification")
  type="notification"
  notif_type=$(echo "$input" | jq -r '.notification_type // empty' 2>/dev/null || true)

  # Try structured enrichment from transcript
  tool_json=$(last_tool_use)
  if [[ -n "$tool_json" && "$tool_json" != "null" ]]; then
    detail=$(format_tool_detail "$tool_json")
    if [[ -n "$detail" ]]; then
      message="${message}"$'\n'"${detail}"
    fi
  fi

  # Capture pane for permission prompts (last 15 lines — shows yes/no/always options)
  # or full pane as fallback for idle prompts and unhandled tools
  if [[ "$notif_type" == "permission_prompt" ]]; then
    pane=$(capture_pane 15)
    if [[ -n "$pane" ]]; then
      message=${message}$'\n```\n'"${pane}"$'\n```'
    fi
  elif [[ -z "${detail:-}" ]]; then
    pane=$(capture_pane)
    if [[ -n "$pane" ]]; then
      pane=$(truncate_message "$pane")
      message=${message}$'\n```\n'"${pane}"$'\n```'
    fi
  fi

elif [[ "$event" == "Stop" ]]; then
  type="stop"
  # Brief delay for transcript flush — the Stop hook can fire before the
  # final assistant message is written to disk
  sleep 0.3
  message=$(last_assistant_text)
  message=$(truncate_message "${message:-Task completed}")

else
  exit 0
fi

# --- Post to bridge ---

jq -n \
  --arg pane_id "$TMUX_PANE" \
  --arg name "$name" \
  --arg session "$session" \
  --arg message "$message" \
  --arg type "$type" \
  '{pane_id: $pane_id, name: $name, session: $session, message: $message, type: $type}' \
| curl -sf -X POST "http://localhost:${BRIDGE_PORT}/notify" \
  -H 'Content-Type: application/json' \
  -d @- \
  >/dev/null 2>&1 &

exit 0
