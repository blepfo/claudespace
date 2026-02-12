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

// Listen for threaded replies from users (not bots)
app.message(async ({ message }) => {
  // Only handle threaded, non-bot, text messages
  if (
    message.subtype ||
    !("thread_ts" in message) ||
    !message.thread_ts ||
    ("bot_id" in message && message.bot_id) ||
    !("text" in message) ||
    !message.text
  ) {
    return;
  }

  const mapping = paneMap.getByThreadTs(message.thread_ts);
  if (!mapping) return;

  const reply = mapReply(message.text);

  try {
    sendKeys(mapping.pane_id, reply);
    await postToThread(
      message.thread_ts,
      mapping.channel_id,
      `Sent to ${mapping.name}: \`${reply}\``
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await postToThread(
      message.thread_ts,
      mapping.channel_id,
      `Failed to send to pane ${mapping.pane_id}: ${errorMsg}`
    );
  }
});
