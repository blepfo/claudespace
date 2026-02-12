import express from "express";
import { config } from "./config.js";
import * as paneMap from "./pane-map.js";
import { createThread, postToThread } from "./slack.js";
import type {
  CreateThreadRequest,
  NotifyRequest,
  CloseRequest,
} from "./types.js";

export const expressApp = express();
expressApp.use(express.json());

// POST /thread — create a Slack thread for a new pane
expressApp.post("/thread", async (req, res) => {
  try {
    const { pane_id, name } = req.body as CreateThreadRequest;
    if (!pane_id || !name) {
      res.status(400).json({ error: "pane_id and name are required" });
      return;
    }

    const text = `*${name}* — New Claude Code session (pane ${pane_id})`;
    const threadTs = await createThread(config.slackChannelId, text);

    paneMap.set(pane_id, {
      pane_id,
      name,
      thread_ts: threadTs,
      channel_id: config.slackChannelId,
      created_at: Date.now(),
    });

    res.json({ ok: true, thread_ts: threadTs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /thread error:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /notify — post a notification or stop message to the pane's thread
expressApp.post("/notify", async (req, res) => {
  try {
    const { pane_id, name, message, type } = req.body as NotifyRequest;
    if (!pane_id || !message) {
      res.status(400).json({ error: "pane_id and message are required" });
      return;
    }

    const mapping = paneMap.getByPaneId(pane_id);
    if (!mapping) {
      res.status(404).json({ error: `No mapping for pane ${pane_id}` });
      return;
    }

    const prefix = type === "stop" ? "Claude finished" : "";
    const text = prefix ? `${prefix}: ${message}` : message;

    await postToThread(mapping.thread_ts, mapping.channel_id, text);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /notify error:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /close — post closing message and remove mapping
expressApp.post("/close", async (req, res) => {
  try {
    const { pane_id, name } = req.body as CloseRequest;
    if (!pane_id) {
      res.status(400).json({ error: "pane_id is required" });
      return;
    }

    const mapping = paneMap.getByPaneId(pane_id);
    if (mapping) {
      await postToThread(
        mapping.thread_ts,
        mapping.channel_id,
        `Session *${name || mapping.name}* closed.`
      );
      paneMap.remove(pane_id);
    }

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /close error:", msg);
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
