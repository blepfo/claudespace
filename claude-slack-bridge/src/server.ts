import express from "express";
import { config } from "./config.js";
import * as paneMap from "./pane-map.js";
import { createThread, postToThread } from "./slack.js";
import type {
  CreateThreadRequest,
  ConnectRequest,
  NotifyRequest,
  CloseRequest,
} from "./types.js";

export const expressApp = express();
expressApp.use(express.json());

// POST /thread — create a Slack thread for a new pane
expressApp.post("/thread", async (req, res) => {
  try {
    const { pane_id, name, session } = req.body as CreateThreadRequest;
    if (!pane_id || !name || !session) {
      res.status(400).json({ error: "pane_id, name, and session are required" });
      return;
    }

    console.log(`[tmux] ${session}/${name}: creating thread`);
    const text = `*[${session}] ${name}* — New Claude Code session (pane ${pane_id})`;
    const threadTs = await createThread(config.slackChannelId, text);

    paneMap.set(pane_id, {
      pane_id,
      name,
      session,
      thread_ts: threadTs,
      channel_id: config.slackChannelId,
      created_at: Date.now(),
    });
    paneMap.persistThread(session, name, threadTs, config.slackChannelId);

    console.log(`[tmux] ${session}/${name}: thread created`);
    res.json({ ok: true, thread_ts: threadTs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tmux] ${req.body?.session ?? "?"}/${req.body?.name ?? "?"}: thread error — ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /connect — reconnect a pane to an existing thread, or create a new one
expressApp.post("/connect", async (req, res) => {
  try {
    const { pane_id, name, session } = req.body as ConnectRequest;
    if (!pane_id || !name || !session) {
      res.status(400).json({ error: "pane_id, name, and session are required" });
      return;
    }

    const existing = paneMap.getPersistedThread(session, name);

    if (existing) {
      // Reconnect to existing thread
      paneMap.set(pane_id, {
        pane_id,
        name,
        session,
        thread_ts: existing.thread_ts,
        channel_id: existing.channel_id,
        created_at: Date.now(),
      });

      console.log(`[tmux] ${session}/${name}: reconnected to existing thread`);
      await postToThread(
        existing.thread_ts,
        existing.channel_id,
        `Reconnected *[${session}] ${name}* (pane ${pane_id})`
      );

      res.json({ ok: true, thread_ts: existing.thread_ts, reconnected: true });
    } else {
      // No existing thread — create a new one
      console.log(`[tmux] ${session}/${name}: no existing thread, creating new`);
      const text = `*[${session}] ${name}* — Claude Code session (pane ${pane_id})`;
      const threadTs = await createThread(config.slackChannelId, text);

      paneMap.set(pane_id, {
        pane_id,
        name,
        session,
        thread_ts: threadTs,
        channel_id: config.slackChannelId,
        created_at: Date.now(),
      });
      paneMap.persistThread(session, name, threadTs, config.slackChannelId);

      console.log(`[tmux] ${session}/${name}: thread created`);
      res.json({ ok: true, thread_ts: threadTs, reconnected: false });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tmux] ${req.body?.session ?? "?"}/${req.body?.name ?? "?"}: connect error — ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /notify — post a notification or stop message to the pane's thread
expressApp.post("/notify", async (req, res) => {
  try {
    const { pane_id, name, session, message, type } = req.body as NotifyRequest;
    if (!pane_id || !message) {
      res.status(400).json({ error: "pane_id and message are required" });
      return;
    }

    // If no active mapping but we have session info, try to auto-connect
    let mapping = paneMap.getByPaneId(pane_id);
    if (!mapping && session && name) {
      const existing = paneMap.getPersistedThread(session, name);
      if (existing) {
        mapping = {
          pane_id,
          name,
          session,
          thread_ts: existing.thread_ts,
          channel_id: existing.channel_id,
          created_at: Date.now(),
        };
        paneMap.set(pane_id, mapping);
        console.log(`[tmux] ${session}/${name}: auto-reconnected via notify`);
      }
    }

    if (!mapping) {
      console.log(`[tmux] ${session ?? "?"}/${name ?? pane_id}: ${type} received but no thread mapping`);
      res.status(404).json({ error: `No mapping for pane ${pane_id}` });
      return;
    }

    let text: string;
    if (type === "stop") {
      text = message ? `*Claude finished:*\n${message}` : "*Claude finished*";
    } else {
      text = message;
    }
    const preview = message.length > 80 ? message.slice(0, 80) + "..." : message;

    console.log(`[tmux] ${mapping.name}: ${type} — ${preview}`);
    await postToThread(mapping.thread_ts, mapping.channel_id, text);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tmux] ${req.body?.session ?? "?"}/${req.body?.name ?? "?"}: notify error — ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /close — post closing message and remove mapping
expressApp.post("/close", async (req, res) => {
  try {
    const { pane_id, name, session, permanent } = req.body as CloseRequest;
    if (!pane_id) {
      res.status(400).json({ error: "pane_id is required" });
      return;
    }

    const mapping = paneMap.getByPaneId(pane_id);
    const effectiveName = name || mapping?.name;
    const effectiveSession = session || mapping?.session;

    if (mapping) {
      console.log(`[tmux] ${effectiveSession}/${effectiveName}: session closed${permanent ? " (permanent)" : ""}`);
      await postToThread(
        mapping.thread_ts,
        mapping.channel_id,
        `Session *[${effectiveSession}] ${effectiveName}* closed.`
      );
      paneMap.remove(pane_id);
      if (permanent && effectiveSession && effectiveName) {
        paneMap.removePersistedThread(effectiveSession, effectiveName);
      }
    } else {
      console.log(`[tmux] ${effectiveSession ?? "?"}/${effectiveName ?? pane_id}: close received but no thread mapping`);
      // Even without an active mapping, honor permanent deletion from persistent store
      if (permanent && effectiveSession && effectiveName) {
        paneMap.removePersistedThread(effectiveSession, effectiveName);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tmux] ${req.body?.session ?? "?"}/${req.body?.name ?? "?"}: close error — ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// GET /health — status check
expressApp.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mappings: paneMap.size(),
    uptime: process.uptime(),
  });
});
