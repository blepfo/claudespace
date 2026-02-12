import { execSync } from "node:child_process";

const PANE_ID_RE = /^%\d+$/;

const AFFIRMATIVES = new Set(["y", "yes", "ok", "approve", "go", "yeah", "yep", "sure"]);
const NEGATIVES = new Set(["n", "no", "deny", "reject", "nope"]);

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

  execSync(`tmux send-keys -t '${paneId}' -- '${escaped}' Enter`, {
    timeout: 5000,
  });
}
