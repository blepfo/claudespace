import { config } from "./config.js";
import { app, postToThread } from "./slack.js";
import { expressApp } from "./server.js";
import * as paneMap from "./pane-map.js";
import { listClaudePanes } from "./tmux.js";

async function autoReconnect() {
  const panes = listClaudePanes(config.cspaceSession);
  if (panes.length === 0) {
    console.log("[startup] No active claude panes found");
    return;
  }

  for (const { pane_id, name } of panes) {
    const existing = paneMap.getPersistedThread(config.cspaceSession, name);
    if (!existing) {
      console.log(`[startup] ${name}: no persisted thread (skipped)`);
      continue;
    }

    paneMap.set(pane_id, {
      pane_id,
      name,
      session: config.cspaceSession,
      thread_ts: existing.thread_ts,
      channel_id: existing.channel_id,
      created_at: Date.now(),
    });

    console.log(`[startup] ${name}: reconnected (pane ${pane_id})`);
    try {
      await postToThread(
        existing.thread_ts,
        existing.channel_id,
        `*[${name}]* Bridge restarted — reconnected`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[startup] ${name}: failed to post reconnection message — ${msg}`);
    }
  }
}

async function main() {
  // Start Slack Socket Mode connection
  await app.start();
  console.log(`Slack Socket Mode connected`);

  // Start Express HTTP server
  expressApp.listen(config.bridgePort, () => {
    console.log(`Bridge server listening on port ${config.bridgePort}`);
  });

  // Auto-reconnect active panes to persisted threads
  await autoReconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
