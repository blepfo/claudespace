import { PaneMapping, ThreadRecord } from "./types.js";
import { config } from "./config.js";
import * as persistence from "./persistence.js";

const PANE_ID_RE = /^%\d+$/;

// Active pane→thread mappings (in-memory, lost on restart)
const mappings = new Map<string, PaneMapping>();

// Persistent name→thread mappings (survives restarts)
// Keys are "session/name/pane_id" (e.g. "claudespace/main/%42")
// Legacy keys without pane_id ("session/name") are matched by name-based lookups
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

function persistKey(session: string, name: string, paneId: string): string {
  return `${session}/${name}/${paneId}`;
}

export function persistThread(session: string, name: string, paneId: string, threadTs: string, channelId: string): void {
  const key = persistKey(session, name, paneId);
  threadMap.set(key, { name, session, pane_id: paneId, thread_ts: threadTs, channel_id: channelId });
  persistence.save(threadMap);
}

/** Exact lookup by session + name + pane_id */
export function getPersistedThread(session: string, name: string, paneId: string): ThreadRecord | undefined {
  return threadMap.get(persistKey(session, name, paneId));
}

/** Find any persisted thread for this session/name (for reconnection after pane_id changes).
 *  Prefers entries NOT already claimed by an active pane. */
export function getPersistedThreadByName(session: string, name: string): ThreadRecord | undefined {
  let fallback: ThreadRecord | undefined;
  for (const record of threadMap.values()) {
    if (record.session === session && record.name === name) {
      // Prefer an unclaimed thread (no active pane mapping)
      if (!record.pane_id || !mappings.has(record.pane_id)) {
        return record;
      }
      fallback = record;
    }
  }
  return fallback;
}

export function getPersistedByThreadTs(threadTs: string): ThreadRecord | undefined {
  for (const record of threadMap.values()) {
    if (record.thread_ts === threadTs) {
      return record;
    }
  }
  return undefined;
}

export function removePersistedThread(session: string, name: string, paneId: string): boolean {
  const deleted = threadMap.delete(persistKey(session, name, paneId));
  if (deleted) persistence.save(threadMap);
  return deleted;
}

/** Remove all persisted threads matching session/name (used by close --permanent) */
export function removePersistedThreadsByName(session: string, name: string): boolean {
  let deleted = false;
  for (const [key, record] of threadMap) {
    if (record.session === session && record.name === name) {
      threadMap.delete(key);
      deleted = true;
    }
  }
  if (deleted) persistence.save(threadMap);
  return deleted;
}

export function renamePersistedThread(session: string, oldName: string, newName: string): boolean {
  let changed = false;
  const updates: Array<[string, string, ThreadRecord]> = [];

  for (const [key, record] of threadMap) {
    if (record.session === session && record.name === oldName) {
      updates.push([key, record.pane_id ? persistKey(session, newName, record.pane_id) : `${session}/${newName}`, { ...record, name: newName }]);
      changed = true;
    }
  }

  for (const [oldKey, newKey, record] of updates) {
    threadMap.delete(oldKey);
    threadMap.set(newKey, record);
  }

  if (changed) persistence.save(threadMap);
  return changed;
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000).unref();
