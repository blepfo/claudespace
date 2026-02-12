import { PaneMapping } from "./types.js";
import { config } from "./config.js";

const PANE_ID_RE = /^%\d+$/;

const mappings = new Map<string, PaneMapping>();

export function set(paneId: string, mapping: PaneMapping): void {
  if (!PANE_ID_RE.test(paneId)) {
    throw new Error(`Invalid pane_id format: ${paneId}`);
  }
  mappings.set(paneId, mapping);
}

export function getByPaneId(paneId: string): PaneMapping | undefined {
  return mappings.get(paneId);
}

export function getByThreadTs(threadTs: string): PaneMapping | undefined {
  for (const mapping of mappings.values()) {
    if (mapping.thread_ts === threadTs) {
      return mapping;
    }
  }
  return undefined;
}

export function remove(paneId: string): boolean {
  return mappings.delete(paneId);
}

export function size(): number {
  return mappings.size;
}

export function cleanup(): void {
  const now = Date.now();
  for (const [paneId, mapping] of mappings) {
    if (now - mapping.created_at > config.mappingTtlMs) {
      mappings.delete(paneId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000).unref();
