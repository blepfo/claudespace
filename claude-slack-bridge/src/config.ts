import "dotenv/config";

export interface Config {
  slackBotToken: string;
  slackAppToken: string;
  slackChannelId: string;
  slackMentionUserId: string | undefined;
  bridgePort: number;
  mappingTtlMs: number;
  cspaceSession: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const config: Config = {
  slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
  slackAppToken: requireEnv("SLACK_APP_TOKEN"),
  slackChannelId: requireEnv("SLACK_CHANNEL_ID"),
  slackMentionUserId: process.env.SLACK_MENTION_USER_ID || undefined,
  bridgePort: parseInt(process.env.BRIDGE_PORT || "7890", 10),
  mappingTtlMs: parseInt(process.env.MAPPING_TTL_MS || "86400000", 10),
  cspaceSession: process.env.CSPACE_SESSION || "claudespace",
};
