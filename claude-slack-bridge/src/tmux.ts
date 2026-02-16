import { execSync } from "node:child_process";

const PANE_ID_RE = /^%\d+$/;

const AFFIRMATIVES = new Set(["y", "yes", "ok", "approve", "go", "yeah", "yep", "sure"]);
const NEGATIVES = new Set(["n", "no", "deny", "reject", "nope"]);

/** List active claude panes: returns [{pane_id, name}] */
export function listClaudePanes(
  session: string
): Array<{ pane_id: string; name: string }> {
  try {
    const output = execSync(
      `tmux list-panes -t '${session}:0' -F '#{pane_id}:#{@cspace}' 2>/dev/null`,
      { timeout: 5000, encoding: "utf-8" }
    );
    const results: Array<{ pane_id: string; name: string }> = [];
    for (const line of output.trim().split("\n")) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const paneId = line.slice(0, sep);
      const tag = line.slice(sep + 1);
      if (tag.startsWith("claude:")) {
        results.push({ pane_id: paneId, name: tag.slice(7) });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function mapReply(text: string): string {
  const lower = text.trim().toLowerCase();
  if (AFFIRMATIVES.has(lower)) return "y";
  if (NEGATIVES.has(lower)) return "n";
  return text;
}

export function sendKeys(paneId: string, text: string): void {
  if (!PANE_ID_RE.test(paneId)) {
    throw new Error(`Invalid pane_id format: ${paneId}`);
  }

  // Escape single quotes for shell: ' → '\''
  const escaped = text.replace(/'/g, "'\\''");
  const isLargeOrMultiline = text.includes('\n') || text.length > 200;

  if (isLargeOrMultiline) {
    // Use load-buffer + paste-buffer for reliable large/multiline text delivery
    execSync(`printf '%s' '${escaped}' | tmux load-buffer -`, { timeout: 5000 });
    execSync(`tmux paste-buffer -t '${paneId}' -d`, { timeout: 5000 });
    execSync(`sleep 0.2 && tmux send-keys -t '${paneId}' Enter`, { timeout: 5000 });
  } else {
    // -l sends text literally (no key name interpretation), then Enter submits
    execSync(
      `tmux send-keys -t '${paneId}' -l '${escaped}' && tmux send-keys -t '${paneId}' Enter`,
      { timeout: 5000 }
    );
  }
}
