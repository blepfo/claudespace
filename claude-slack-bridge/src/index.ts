import { config } from "./config.js";
import { app } from "./slack.js";
import { expressApp } from "./server.js";

async function main() {
  // Start Slack Socket Mode connection
  await app.start();
  console.log(`Slack Socket Mode connected`);

  // Start Express HTTP server
  expressApp.listen(config.bridgePort, () => {
    console.log(`Bridge server listening on port ${config.bridgePort}`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
