const axios = require("axios");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const { youtube_channel_ids } = require("./assets/YouTube_channels");
const fs = require("fs").promises; // مكتبة للتعامل مع الملفات

// Call the dotenv
const dotenv = require("dotenv");
dotenv.config();

// Create Client and give it intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

//scanning file path
const LAST_CHECK_FILE = "./lastCheck.json";

// reading the lastCheck file
async function getLastCheckTime() {
    try {
        const data = await fs.readFile(LAST_CHECK_FILE, "utf8");
        return new Date(JSON.parse(data).lastCheck);
    } catch (error) {
        return new Date(0);
    }
}

// save the new scann
async function saveLastCheckTime() {
    const now = new Date();
    await fs.writeFile(LAST_CHECK_FILE, JSON.stringify({ lastCheck: now.toISOString() }), "utf8");
}

// Print Ready! Logged in as {client tag} once in console
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // run every 30m
    sendToDiscord();
    setInterval(sendToDiscord, 1800000); // every 30m
});

// Loop on youtube_channel_ids and get new videos
async function getNewVideos() {
    const videoInfo = [];
    const lastCheckTime = await getLastCheckTime(); // call lastCheck

    try {
        for (const channelId of Object.values(youtube_channel_ids)) {
            const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
                params: {
                    part: "snippet",
                    channelId: channelId,
                    maxResults: 5,
                    order: "date",
                    type: "video",
                    key: process.env.YOUTUBE_API,
                },
            });

            const videos = response.data.items;
            videos.forEach(video => {
                const title = video.snippet.title;
                const videoId = video.id.videoId;
                const publishedAt = new Date(video.snippet.publishedAt);
                const url = `https://www.youtube.com/watch?v=${videoId}`;

                // add new video after last scann
                if (publishedAt > lastCheckTime) {
                    videoInfo.push({
                        title,
                        url,
                        publishedAt: publishedAt.toISOString(),
                        channelId,
                    });

                    console.log(title);
                    console.log(url);
                    console.log(publishedAt);
                    console.log("------");
                }
            });
        }

        // Sort from newest to oldest 
        videoInfo.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        return videoInfo;
    } catch (error) {
        console.log("the error:", error.message);
        return [];
    }
}

// send to discord channel
async function sendToDiscord() {
    const videos = await getNewVideos();

    if (videos.length === 0) {
        console.log("there is no videos");
        return;
    }

    const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);

    if (!channel) {
        console.log(" ther is no CHANNEL_ID!");
        return;
    }

    videos.forEach(video => {
        const message = `New Video\nTitle: ${video.title}\nLink: ${video.url}\nDate: ${video.publishedAt}`;
        channel.send(message);
    });

    // save the new scann
    await saveLastCheckTime();
}

// Login the client
client.login(process.env.DISCORD_TOKEN);