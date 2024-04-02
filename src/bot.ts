import {
  Channel,
  Client,
  Events,
  GatewayIntentBits,
  blockQuote,
} from "discord.js";
import { landsCollection, landDoc } from "./services/firebase";
import Land from "./models/land";
import TreeInfo from "./models/treeInfo";

require("dotenv").config();

const { DISCORD_TOKEN, DISCORD_GUILD, DISCORD_CHANNEL } = process.env;

const messageQueue: string[] = [];

async function runBot() {
  // Create a new client instance
  const client = new Client({
    intents: [GatewayIntentBits.GuildMessages],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord logged: ${readyClient.user.tag}`);

    checkLands(client);
  });

  client.once(Events.GuildMemberAdd, (member) => {
    console.log(`Member joined: ${member.user.tag}`);

    member.send(`Welcome to the server!`);
  });

  // Log in to discord with client token
  client.login(DISCORD_TOKEN);
}

async function checkLands(client: Client) {
  const discordMaxMessageLength = 2000;

  // Listen lands collection
  const query = landsCollection;
  query.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "removed") {
        return;
      }

      const land = change.doc.data() as Land;

      const landId = land.id;

      const earlyTrees: TreeInfo[] = [];
      const grownTrees: TreeInfo[] = [];
      const farmedTrees: TreeInfo[] = [];
      const growingTrees: TreeInfo[] = [];

      await land.trees.forEach(async (tree) => {
        if (tree.previousState == tree.currentState && tree.currentState != "3" && tree.currentState != "4") {
          console.log(`Tree ${tree.id} has not changed state and is not on state 3 or 4. Skipping. Current state: ${tree.currentState}.`);
          return;
        }

        console.log(`Tree ${tree.id} has changed state or is on state 3 or 4. Previous state: ${tree.previousState}. Current state: ${tree.currentState}.`);

        let timeRemaining = tree.timeRemaining === undefined ? "Not calculed yet." : `${tree.timeRemaining / 1000 / 60 / 60} hours.`;

        switch (String(tree.currentState)) {
          case "3":
            timeRemaining = tree.timeRemaining === undefined ? "Not calculed yet." : `${tree.timeRemaining / 1000 / 60} minutes.`;
            earlyTrees.push({ id: tree.id, timeRemaining });
            console.log(`Tree ${tree.id} is early.`);
            break;

          case "4":
            grownTrees.push({ id: tree.id, timeRemaining: "" });
            console.log(`Tree ${tree.id} is grown.`);
            break;

          case "5":
            farmedTrees.push({ id: tree.id, timeRemaining });
            console.log(`Tree ${tree.id} is farmed.`);
            break;

          default:
            growingTrees.push({ id: tree.id, timeRemaining });
            console.log(`Tree ${tree.id} is growing.`);
        }
      });

      if (earlyTrees.length > 1 || grownTrees.length > 1) {
        const treesMessage = `# 🏝️ Land #${landId} has ${land.trees.length} trees.\n`;

        let earlyTreesMessage = `### 🌱 Trees close to growing: ${earlyTrees.length}.\n`;
        earlyTreesMessage = getTreeListMessage(earlyTreesMessage, landId, earlyTrees);

        let grownTreesMessage = `### 🌲 Overgrown trees: ${grownTrees.length}.\n`;
        //grownTreesMessage = getTreeListMessage(grownTreesMessage, landId, grownTrees);

        let farmedTreesMessage = ""; //`### 🪓 Farmed trees: ${farmedTrees.length}.\n`;
        //farmedTreesMessage = getTreeListMessage(farmedTreesMessage, landId, farmedTrees);

        let growingTreesMessage = ""; //`### 🌿 Growing trees: ${growingTrees.length}.\n`;
        //growingTreesMessage = getTreeListMessage(growingTreesMessage, landId, growingTrees);

        const message = `${treesMessage}${earlyTreesMessage}${grownTreesMessage}${farmedTreesMessage}${growingTreesMessage}`;

        if (message.length > discordMaxMessageLength) {
          let i = 0;
          while (i < message.length) {
            let end = i + discordMaxMessageLength;
            if (end < message.length) {
              end = message.lastIndexOf("\n", end);
              if (end > -1) {
                end++;
              }
            }

            const subMessage = message.substring(i, end);
            sendMessageEnqueue(client, subMessage);
            i = end;
          }
        } else {
          sendMessageEnqueue(client, message);
        }
      }
    });
  });
}

function getTreeListMessage(message: string, landId: string, trees: TreeInfo[]) {
  if (trees.length > 0) {
    message += trees.map((tree) => {
      return `\`Tree #${landId}-${tree.id}. ${tree.timeRemaining}\``;
    })
    .join("\n");
  }

  return message + "\n";
}

function sendMessageEnqueue(client: Client, message: string) {
  messageQueue.push(message);

  if (messageQueue.length === 1) {
    sendMessageInterval(client);
  }
}

async function sendMessageInterval(client: Client) {
  const message = messageQueue.shift();
  if (message) {
    await sendMessage(client, message);
  }

  if (messageQueue.length > 0) {
    setTimeout(sendMessageInterval, 1000);
  }
}

async function sendMessage(client: Client, message: string) {
  const channel = await getChannel(client);

  if (!channel) {
    console.log("Channel not found.");
    return;
  }

  if (channel.isTextBased()) {
    await channel.send(blockQuote(message));

    console.log(
      `Message: ${message.replace(
        "\n",
        ""
      )} Sended to channeld ${channel.id} of guild ${channel.guildId}.`
    );
  }
}

async function deleteAllMessages(client: Client) {
  const channel = await getChannel(client);

  if (!channel) {
    console.log("Channel not found.");
    return;
  }

  if (channel.isTextBased()) {
    const messages = await channel.messages.fetch();
    messages.forEach(async (message) => {
      await message.delete();
    });

    console.log(`All messages deleted from channel ${channel.id}.`);
  }

}

async function getChannel(client: Client) {
  const guildId = DISCORD_GUILD || "";
  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    console.log(`Guild ${guildId} not found.`);
    return;
  }
  console.log(`Guild ${guildId}`);

  const channelId = DISCORD_CHANNEL || "";
  const channel = await guild.channels.fetch(channelId);
  if (!channel) {
    console.log(`Channel ${channelId} not found.`);
    return;
  }
  console.log(`Channel ${channelId}`);

  return channel;
}

export default runBot;
