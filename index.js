
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


client.on(Events.MessageCreate, async message => {
	
	if (message.author.bot) return;

	// Check if the channel is muted
	if (mutedChannels.has(message.channel.id) && mutedChannels.get(message.channel.id) > Date.now()) {
		return;
	}

	// Check if the bot has already responded in this thread
	if (message.channel.isThread() && respondedThreads.has(message.channel.id) && !message.mentions.has(client.user.id)) {
		return;
	}

	// Check for mute commands
	const lowerCaseMessage = message.content.toLowerCase();
	const isMuteCommand = lowerCaseMessage.includes('shut up') || lowerCaseMessage.includes('bot quiet');
	const isReplyingToBot = message.reference && message.reference.messageId && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;
	const isMentioningBot = message.mentions.has(client.user.id);

	if (isMuteCommand && (isReplyingToBot || isMentioningBot)) {
		const muteDuration = 5 * 60 * 1000; // 5 minutes
		mutedChannels.set(message.channel.id, Date.now() + muteDuration);
		message.react('🤫');
		return;
	}

	
	if (!aiWrapperUrl || !aiModelName) {
		return;
	}

	let userMessage = message.content.trim();

	// If in a forum, prepend the post title to the message
	if (message.channel.isThread() && message.channel.parent.type === ChannelType.GuildForum) {
		userMessage = `Title: ${message.channel.name}\nBody: ${userMessage}`;
	}

	// Add embed content to the message
	if (message.embeds.length > 0) {
		const embed = message.embeds[0];
		let embedContent = `[Embed Content: Title: ${embed.title}, Description: ${embed.description}]`;
		userMessage = `${userMessage}\n${embedContent}`;
	}
	
	if (!userMessage || userMessage.length < 3) return;

	// Fetch last 5 messages for context
	const messageHistory = await message.channel.messages.fetch({ limit: 5 });
	const historyString = messageHistory.reverse().map(m => {
		let content = `${m.author.username}: ${m.content}`;
		if (m.embeds.length > 0) {
			const embed = m.embeds[0];
			content += ` [Embed Content: Title: ${embed.title}, Description: ${embed.description}]`;
		}
		return content;
	}).join('\n');

	const prompt = `You are the official Pstream Support bot. Your responses MUST be short, concise, and directly to the point. Avoid conversational filler.

Here is the recent chat history for context (including embed content):
--- CHAT HISTORY START ---
${historyString}
--- CHAT HISTORY END ---

Here is your knowledge base (FAQ):
--- FAQ START ---
${faqStringForPrompt}
--- FAQ END ---

The user's latest message is: "${userMessage}"

Follow these instructions precisely:
1.  **Social Context Check (VERY IMPORTANT):** Review the CHAT HISTORY. Is another user already actively helping the person asking for support? If so, you MUST NOT respond, unless you are directly mentioned by name (@P-stream support). Prioritize letting humans help each other. If a helper is present, respond with [IGNORE].
2.  **Confidence Check:** Is the user's question directly and confidently answered by the FAQ? If not, you MUST respond with [IGNORE]. Do not guess or make up answers about topics not in the FAQ.
3.  **Relevance Check:** Only mention a specific solution (like 'Fed-Api') if the user's problem is directly related to it (e.g., slow streaming). Do not offer unsolicited advice.
4.  **Analyze Intent:** Is the user asking a genuine support question about pstream?
    *   **Forum Post Exception:** If the message is a forum post (Title + Body) and the body is short (e.g., "title says it all"), the Title is the user's question.
    *   If the message is not a clear support question about pstream, respond with [IGNORE].
5.  **Answering:** If the question passes all checks, provide a concise answer based on the FAQ.
    *   **Safety:** For "is pstream safe?", respond ONLY with: "Yes, it is safe. The source code is available on GitHub: https://github.com/p-stream/p-stream"
    *   **Video/Audio Issues:** This is a two-step process.
        1.  **First-time request:** If the user reports a video/audio issue and you have NOT previously suggested switching sources in the recent history, your response should be: "The primary solution is to switch the video source, as P-stream does not control the media files scraped from providers."
        2.  **Follow-up request:** If the user's message indicates the first solution didn't work (e.g., "did not work," "what else can I do?"), and you have ALREADY suggested switching sources, your response should be: "If switching sources doesn't help, you can unlock more stable sources by downloading the browser extension or setting up Fed-Api. The Fed-Api setup guide is here: https://discord.com/channels/1267558147682205738/1267558148466806926/1414765913286381610"
    *   **Website Lag:** For website lag, suggest checking their internet, clearing cache, or enabling 'Low Performance Mode'.
    *   **Other FAQ Topics:** Answer directly from the FAQ.

Your primary goal is to be a silent, accurate assistant. If in doubt, do not respond.`;
	   

	
	const requestBody = {
		contents: [{
			parts: [{ text: prompt }]
		}],
	};

	
	const apiUrl = `${aiWrapperUrl}/v1beta/models/${aiModelName}:generateContent`;

	try {
  console.log(`Sending generation request for message: "${userMessage}"`);
		const response = await axios.post(apiUrl, requestBody, {
			headers: { 'Content-Type': 'application/json' },
			timeout: 30000 
		});

		
		let aiResponseText = '';
		if (response.data && response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content && response.data.candidates[0].content.parts && response.data.candidates[0].content.parts[0]) {
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

		          await message.channel.sendTyping();
			await message.reply({
				content: finalResponse,
				allowedMentions: { repliedUser: false }
			});
			// If in a thread, mark it as responded to
			if (message.channel.isThread()) {
				respondedThreads.add(message.channel.id);
			}
		} else if (aiResponseText === ignoreMarker) {
		          
		          console.log("AI response was [IGNORE]. No reply sent.");
		      } else {
		          
		          console.log("AI response was empty or an error occurred before processing. No reply sent.");
		      }

	} catch (error) {
		console.error("Error calling AI Wrapper for generation:", error.response ? error.response.data : error.message);
        
		
	}
});




client.login(token);