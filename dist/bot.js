"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const firebase_1 = require("./services/firebase");
require("dotenv").config();
const { DISCORD_TOKEN, DISCORD_GUILD, DISCORD_CHANNEL } = process.env;
const messageQueue = [];
function runBot() {
    return __awaiter(this, void 0, void 0, function* () {
        // Create a new client instance
        const client = new discord_js_1.Client({
            intents: [discord_js_1.GatewayIntentBits.GuildMessages],
        });
        client.once(discord_js_1.Events.ClientReady, (readyClient) => {
            console.log(`Discord logged: ${readyClient.user.tag}`);
            checkLands(client);
        });
        client.once(discord_js_1.Events.GuildMemberAdd, (member) => {
            console.log(`Member joined: ${member.user.tag}`);
            member.send(`Welcome to the server!`);
        });
        // Log in to discord with client token
        client.login(DISCORD_TOKEN);
    });
}
function checkLands(client) {
    return __awaiter(this, void 0, void 0, function* () {
        const discordMaxMessageLength = 2000;
        // Listen lands collection
        const query = firebase_1.landsCollection;
        query.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => __awaiter(this, void 0, void 0, function* () {
                if (change.type === "removed") {
                    return;
                }
                const land = change.doc.data();
                const landId = land.id;
                const earlyTrees = [];
                const grownTrees = [];
                const farmedTrees = [];
                const growingTrees = [];
                yield land.trees.forEach((tree) => __awaiter(this, void 0, void 0, function* () {
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
                }));
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
                    }
                    else {
                        sendMessageEnqueue(client, message);
                    }
                }
            }));
        });
    });
}
function getTreeListMessage(message, landId, trees) {
    if (trees.length > 0) {
        message += trees.map((tree) => {
            return `\`Tree #${landId}-${tree.id}. ${tree.timeRemaining}\``;
        })
            .join("\n");
    }
    return message + "\n";
}
function sendMessageEnqueue(client, message) {
    messageQueue.push(message);
    if (messageQueue.length === 1) {
        sendMessageInterval(client);
    }
}
function sendMessageInterval(client) {
    return __awaiter(this, void 0, void 0, function* () {
        const message = messageQueue.shift();
        if (message) {
            yield sendMessage(client, message);
        }
        if (messageQueue.length > 0) {
            setTimeout(sendMessageInterval, 1000);
        }
    });
}
function sendMessage(client, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = yield getChannel(client);
        if (!channel) {
            console.log("Channel not found.");
            return;
        }
        if (channel.isTextBased()) {
            yield channel.send((0, discord_js_1.blockQuote)(message));
            console.log(`Message: ${message.replace("\n", "")} Sended to channeld ${channel.id} of guild ${channel.guildId}.`);
        }
    });
}
function deleteAllMessages(client) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = yield getChannel(client);
        if (!channel) {
            console.log("Channel not found.");
            return;
        }
        if (channel.isTextBased()) {
            const messages = yield channel.messages.fetch();
            messages.forEach((message) => __awaiter(this, void 0, void 0, function* () {
                yield message.delete();
            }));
            console.log(`All messages deleted from channel ${channel.id}.`);
        }
    });
}
function getChannel(client) {
    return __awaiter(this, void 0, void 0, function* () {
        const guildId = DISCORD_GUILD || "";
        const guild = yield client.guilds.fetch(guildId);
        if (!guild) {
            console.log(`Guild ${guildId} not found.`);
            return;
        }
        console.log(`Guild ${guildId}`);
        const channelId = DISCORD_CHANNEL || "";
        const channel = yield guild.channels.fetch(channelId);
        if (!channel) {
            console.log(`Channel ${channelId} not found.`);
            return;
        }
        console.log(`Channel ${channelId}`);
        return channel;
    });
}
exports.default = runBot;
