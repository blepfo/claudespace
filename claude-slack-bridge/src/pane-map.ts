import { PaneMapping, ThreadRecord } from "./types.js";
import { config } from "./config.js";
import * as persistence from "./persistence.js";

const PANE_ID_RE = /^%\d+$/;

// Active pane→thread mappings (in-memory, lost on restart)
const mappings = new Map<string, PaneMapping>();

// Persistent name→thread mappings (survives restarts)
let threadMap: Map<string, ThreadRecord> = persistence.load();

function validatePaneId(paneId: string): void {
  if (!PANE_ID_RE.test(paneId)) {
    throw new Error(`Invalid pane_id format: ${paneId}`);
  }
}

export function set(paneId: string, mapping: PaneMapping): void {
  validatePaneId(paneId);
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

// --- Persistent thread map ---

export function persistThread(name: string, threadTs: string, channelId: string): void {
  threadMap.set(name, { name, thread_ts: threadTs, channel_id: channelId });
  persistence.save(threadMap);
}

export function getPersistedThread(name: string): ThreadRecord | undefined {
  return threadMap.get(name);
}

export function getPersistedByThreadTs(threadTs: string): ThreadRecord | undefined {
  for (const record of threadMap.values()) {
    if (record.thread_ts === threadTs) {
      return record;
    }
  }
  return undefined;
}

export function removePersistedThread(name: string): boolean {
  const deleted = threadMap.delete(name);
  if (deleted) persistence.save(threadMap);
  return deleted;
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000).unref();
