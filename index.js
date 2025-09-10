const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { Client, Events, GatewayIntentBits, Collection, MessageFlags, ChannelType } = require('discord.js');
const { token, aiWrapperUrl, aiModelName } = require('./config.json');


const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	]
});

const mutedChannels = new Map();
const respondedThreads = new Set();
const disabledSupportChannels = new Set();
const allowedChannels = ['general', 'ipa-exe-app-support', 'bot-commands'];
const allowedForums = ['issues-and-bugs'];
const supportCommandRoles = ['P-Stream Team', 'Perms'];
const supportCommandUsers = ['shikhaliyev_15'];

const faqPath = path.join(__dirname, 'faq.json');
let faqData = [];
try {
    faqData = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
} catch (error) {
    console.error("Error reading or parsing faq.json:", error);
}

function formatFaqForPrompt(faqItems) {
	return faqItems.map(item => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n');
}
const faqStringForPrompt = formatFaqForPrompt(faqData);

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
	if (!aiWrapperUrl || !aiModelName) {
		console.warn("AI Wrapper URL or Model Name missing in config.json. AI features will be disabled.");
	}
});

client.on(Events.Error, error => {
    console.error('A client error occurred:', error);
});

async function processSupportRequest(message, targetMessage, isTargeted = false) {
	if (!isTargeted) {
		const channelName = message.channel.name;
		const parentChannelName = message.channel.isThread() ? message.channel.parent?.name : null;
		const isAllowedChannel = allowedChannels.includes(channelName);
		const isAllowedForum = allowedForums.includes(parentChannelName);
		if (!isAllowedChannel && !isAllowedForum) return;
		if (disabledSupportChannels.has(message.channel.id)) return;
		if (mutedChannels.has(message.channel.id) && mutedChannels.get(message.channel.id) > Date.now()) return;
		if (message.channel.isThread() && respondedThreads.has(message.channel.id) && !message.mentions.users.has(client.user.id)) return;
	}

	if (!aiWrapperUrl || !aiModelName) return;

	let userMessage = message.content.trim();

	if (message.channel.isThread() && message.channel.parent.type === ChannelType.GuildForum) {
		userMessage = `Title: ${message.channel.name}\nBody: ${userMessage}`;
	}

	if (message.embeds.length > 0) {
		const embed = message.embeds[0];
		let embedContent = `[Embed Content: Title: ${embed.title}, Description: ${embed.description}]`;
		userMessage = `${userMessage}\n${embedContent}`;
	}
	
	if (!userMessage || userMessage.length < 3) return;

	const messageHistory = await message.channel.messages.fetch({ limit: 50 });
	const historyString = messageHistory.reverse().map(m => {
		let content = `${m.author.username}: ${m.content}`;
		if (m.embeds.length > 0) {
			const embed = m.embeds[0];
			content += ` [Embed Content: Title: ${embed.title}, Description: ${embed.description}]`;
		}
		return content;
	}).join('\n');

	const prompt = `You are the official Pstream Support bot. Your responses MUST be short, concise, and directly to the point. Avoid conversational filler.

Here is the recent chat history for the channel #${message.channel.name}. Use this to understand the current conversation's context:
--- CHAT HISTORY START ---
${historyString}
--- CHAT HISTORY END ---

Here is your knowledge base (FAQ):
--- FAQ START ---
${faqStringForPrompt}
--- FAQ END ---

The user's latest message is: "${userMessage}"

Follow these instructions precisely:
1.  **Advanced Social Context Check (VERY IMPORTANT):** Review the last 5 messages in the CHAT HISTORY. Has another user (not the original poster) replied to the person asking for help within the last 2-3 messages? If so, a support conversation is already in progress. In this case, you MUST NOT respond unless you are explicitly mentioned by name (@P-stream support or @1366455600925511770). Your goal is to avoid interrupting a human who is already helping. If a helper is actively engaged, respond with [IGNORE].
2.  **Confidence Check:** Is the user's question directly and confidently answered by the FAQ? If not, you MUST respond with [IGNORE]. Do not guess or make up answers about topics not in the FAQ.
3.  **Relevance Check:** Only mention a specific solution (like 'CIA API') if the user's problem is directly related to it (e.g., slow streaming). Do not offer unsolicited advice.
4.  **Analyze Intent:** Is the user asking a genuine support question about pstream?
    *   **Forum Post Exception:** If the message is a forum post (Title + Body) and the body is short (e.g., "title says it all"), the Title is the user's question.
    *   If the message is not a clear support question about pstream, respond with [IGNORE].
5.  **Answering:** If the question passes all checks, provide a concise answer based on the FAQ.
    *   **Safety:** For "is pstream safe?", respond ONLY with: "Yes, it is safe. The source code is available on GitHub: https://github.com/p-stream/p-stream"
    *   **Video/Audio Issues:** This is a two-step process.
        1.  **First-time request:** If the user reports a video/audio issue and you have NOT previously suggested switching sources in the recent history, your response should be: "The primary solution is to switch the video source, as P-stream does not control the media files scraped from providers."
        2.  **Follow-up request:** If the user's message indicates the first solution didn't work (e.g., "did not work," "what else can I do?"), and you have ALREADY suggested switching sources, your response should be: "If switching sources doesn't help, you can unlock more stable sources by downloading the browser extension or using the CIA API."
    *   **Website Lag:** For website lag, suggest checking their internet, clearing cache, or enabling 'Low Performance Mode'.
    *   **Other FAQ Topics:** Answer directly from the FAQ.

Your primary goal is to be a silent, accurate assistant. If in doubt, do not respond.`;

	const requestBody = {
		contents: [{
			parts: [{ text: prompt }]
		}],
		safetySettings: [
			{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
			{ category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
			{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
			{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
		]
	};

	try {
		console.log(`Sending generation request for message: "${userMessage}"`);
		const response = await axios.post(`${aiWrapperUrl}/v1beta/models/${aiModelName}:generateContent`, requestBody, {
			headers: { 'Content-Type': 'application/json' },
			timeout: 40000 
		});

		let aiResponseText = '';
		if (response.data?.candidates?.[0]?.content?.parts?.[0]) {
			aiResponseText = response.data.candidates[0].content.parts[0].text.trim();
		} else {
			console.error("Unexpected AI response format:", response.data);
            return; 
		}

		console.log("AI Generated Response:", aiResponseText);
		
		const ignoreMarker = "[IGNORE]";
		if (aiResponseText && aiResponseText !== ignoreMarker) {
			const disclaimer = "\n-# This is AI generated, may not be accurate";
			const finalResponse = aiResponseText + disclaimer;

			await targetMessage.channel.sendTyping();
			await targetMessage.reply({
				content: finalResponse,
				allowedMentions: { repliedUser: false },
				suppressEmbeds: true
			});
			if (targetMessage.channel.isThread()) {
				respondedThreads.add(targetMessage.channel.id);
			}
		} else {
			console.log("AI response was [IGNORE] or empty. No reply sent.");
		}
	} catch (error) {
		console.error("Error calling AI Wrapper for generation:", error.response ? error.response.data : error.message);
	}
}

client.on(Events.MessageCreate, async message => {
	if (message.author.bot) return;

	// --- Command Handling ---
	const hasPermission = message.member?.roles.cache.some(role => supportCommandRoles.includes(role.name)) || supportCommandUsers.includes(message.author.username);

	// Targeted response command
	if (message.reference && message.mentions.users.has(client.user.id) && message.content.toLowerCase().includes('answer him')) {
		if (hasPermission) {
			const targetMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
			if (targetMessage) {
				await processSupportRequest(targetMessage, targetMessage, true);
			}
		}
		return;
	}

	// Support toggle command
	if (message.content.startsWith('-support')) {
		if (hasPermission) {
			const command = message.content.split(' ')[1];
			const channelId = message.channel.id;
			let replyMsg;

			if (command === 'off') {
				disabledSupportChannels.add(channelId);
				replyMsg = await message.reply('Support has been disabled for this channel.');
			} else if (command === 'on') {
				disabledSupportChannels.delete(channelId);
				replyMsg = await message.reply('Support has been enabled for this channel.');
			} else if (command === 'status') {
				const status = disabledSupportChannels.has(channelId) ? 'disabled' : 'enabled';
				replyMsg = await message.reply(`Support is currently **${status}** for this channel.`);
			}
			
			if (replyMsg) {
				setTimeout(() => replyMsg.delete().catch(console.error), 5000);
			}
		}
		return;
	}

	// Mute command
	const lowerCaseMessage = message.content.toLowerCase();
	const isMuteCommand = lowerCaseMessage.includes('shut up') || lowerCaseMessage.includes('bot quiet');
	if (isMuteCommand) {
		let isReplyingToBot = false;
		if (message.reference && message.reference.messageId) {
			const repliedTo = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
			if (repliedTo && repliedTo.author.id === client.user.id) {
				isReplyingToBot = true;
			}
		}
		const isMentioningBot = message.mentions.users.has(client.user.id);
		if (isReplyingToBot || isMentioningBot) {
			const muteDuration = 5 * 60 * 1000; // 5 minutes
			mutedChannels.set(message.channel.id, Date.now() + muteDuration);
			message.react('🤫');
			return;
		}
	}

	// --- Regular Message Processing ---
	await processSupportRequest(message, message);
});

client.login(token);