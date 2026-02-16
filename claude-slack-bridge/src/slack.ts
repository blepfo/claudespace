import { App } from "@slack/bolt";
import { config } from "./config.js";
import * as paneMap from "./pane-map.js";
import { mapReply, sendKeys } from "./tmux.js";

export const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

export async function createThread(
  channelId: string,
  text: string
): Promise<string> {
  const result = await app.client.chat.postMessage({
    channel: channelId,
    text,
  });
  return result.ts!;
}

export async function postToThread(
  threadTs: string,
  channelId: string,
  text: string
): Promise<void> {
  await app.client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}

// Track threads we've already warned about disconnection (dedup)
const warnedThreads = new Set<string>();

// Listen for threaded replies from users (not bots)
app.message(async ({ message }) => {
  // Only handle threaded, non-bot, text messages
  if (message.subtype) return;
  if (!("thread_ts" in message) || !message.thread_ts) return;
  if ("bot_id" in message && message.bot_id) return;
  if (!("text" in message) || !message.text) return;

  const threadTs = message.thread_ts;
  const mapping = paneMap.getByThreadTs(threadTs);

  if (!mapping) {
    // No active mapping — check if this is a known thread that lost its connection
    const persisted = paneMap.getPersistedByThreadTs(threadTs);
    if (persisted && !warnedThreads.has(threadTs)) {
      warnedThreads.add(threadTs);
      const channelId = "channel" in message ? (message.channel as string) : persisted.channel_id;
      console.log(`[slack] Reply in disconnected thread for ${persisted.session}/${persisted.name} — warning`);
      await postToThread(
        threadTs,
        channelId,
        `*[${persisted.name}]* Disconnected from bridge. Run \`claudespace connect ${persisted.name}\` to reconnect.`
      );
    } else if (!persisted) {
      console.log(`[slack] Reply in unknown thread — ignoring`);
    }
    return;
  }

  const reply = mapReply(message.text);
  console.log(`[slack] ${mapping.name}: received reply — "${reply}"`);

  // Clear any previous warning for this thread since it's now connected
  warnedThreads.delete(threadTs);

  try {
    sendKeys(mapping.pane_id, reply);
    console.log(`[slack] ${mapping.name}: sent to pane`);
    await postToThread(
      threadTs,
      mapping.channel_id,
      `*[${mapping.name}]* Sent: \`${reply}\``
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[slack] ${mapping.name}: send failed — ${errorMsg}`);
    await postToThread(
      threadTs,
      mapping.channel_id,
      `*[${mapping.name}]* Failed to send: ${errorMsg}`
    );
  }
});
