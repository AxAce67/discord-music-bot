import { REST, Routes } from "discord.js";
import { loadConfig } from "../src/config/env.js";
import { slashCommandDefinitions } from "../src/commands/music-command-handler.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(config.DISCORD_CLIENT_ID),
    { body: slashCommandDefinitions }
  );

  console.log("Registered global slash commands.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
