const axios = require("axios");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const { youtube_channel_ids } = require("./assets/YouTube_channels");
const fs = require("fs").promises;
const dotenv = require("dotenv");

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const LAST_CHECK_FILE = "./lastCheck.json";

async function getLastCheckTime() {
    try {
        const data = await fs.readFile(LAST_CHECK_FILE, "utf8");
        return new Date(JSON.parse(data).lastCheck);
    } catch (error) {
        // If file doesn't exist, return a date far in the past to get all videos
        return new Date(0);
    }
}

async function saveLastCheckTime(time) {
    await fs.writeFile(LAST_CHECK_FILE, JSON.stringify({ lastCheck: time.toISOString() }), "utf8");
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // Initial check
    checkAndSendVideos();
    // Check every 20 minutes (1200000 ms) for new videos
    setInterval(checkAndSendVideos, 1200000);
});

async function getNewVideos() {
    const videoInfo = [];
    const lastCheckTime = await getLastCheckTime();
    const now = new Date();

    try {
        for (const channelId of Object.values(youtube_channel_ids)) {
            const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
                params: {
                    part: "snippet",
                    channelId: channelId,
                    maxResults: 10, // Increased to catch more videos
                    order: "date",
                    type: "video",
                    publishedAfter: lastCheckTime.toISOString(),
                    key: process.env.YOUTUBE_API,
                },
            });

            const videos = response.data.items;
            videos.forEach(video => {
                const title = video.snippet.title;
                const videoId = video.id.videoId;
                const publishedAt = new Date(video.snippet.publishedAt);
                const url = `https://www.youtube.com/watch?v=${videoId}`;

                // Only include videos published after last check
                if (publishedAt > lastCheckTime) {
                    videoInfo.push({
                        title,
                        url,
                        publishedAt: publishedAt.toISOString(),
                        channelId,
                    });
                }
            });
        }

        // Sort from oldest to newest
        videoInfo.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)); // Changed sorting order
        return { videos: videoInfo, checkTime: now };
    } catch (error) {
        console.error("Error fetching videos:", error.message);
        return { videos: [], checkTime: now };
    }
}

async function sendToDiscord(videos) {
    if (videos.length === 0) {
        console.log("No new videos found");
        return;
    }

    const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
        console.error("Channel not found!");
        return;
    }

    // Send videos one by one to maintain order
    for (const video of videos) {
        const message = `New Video\nTitle: ${video.title}\nLink: ${video.url}\nDate: ${video.publishedAt}`;
        try {
            await channel.send(message);
            console.log(`Sent video: ${video.title}`);
        } catch (error) {
            console.error(`Error sending video ${video.title}:`, error.message);
        }
    }
}

async function checkAndSendVideos() {
    const { videos, checkTime } = await getNewVideos();

    if (videos.length > 0) {
        await sendToDiscord(videos);
        // Update last check time only after successful sending
        await saveLastCheckTime(checkTime);
    } else {
        // Still update the last check time to avoid checking old videos repeatedly
        await saveLastCheckTime(checkTime);
    }
}

client.login(process.env.DISCORD_TOKEN);
