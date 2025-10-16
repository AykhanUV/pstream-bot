const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios'); 
const { Client, Events, GatewayIntentBits, Collection, MessageFlags, ChannelType, AttachmentBuilder } = require('discord.js');
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
const supportCommandUsers = ['aykhanuv'];



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

// Gracefully handle connection errors to prevent crashes
client.on(Events.Error, error => {
	   console.error('A client error occurred:', error);
});


client.on(Events.MessageCreate, async message => {
	
	if (message.author.bot) return;

	// Check if the bot is allowed to speak in this channel
	const channelName = message.channel.name;
	const parentChannelName = message.channel.isThread() ? message.channel.parent?.name : null;
	const isAllowedChannel = allowedChannels.includes(channelName);
	const isAllowedForum = allowedForums.includes(parentChannelName);

	if (!isAllowedChannel && !isAllowedForum) {
		return;
	}

	// Check for support toggle commands
	const hasPermission = message.member.roles.cache.some(role => supportCommandRoles.includes(role.name)) || supportCommandUsers.includes(message.author.username);
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
		return; // Stop processing after handling a support command
	}

	// Check if support is disabled for this channel
	if (disabledSupportChannels.has(message.channel.id)) {
		return;
	}

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
	
	let isReplyingToBot = false;
	if (message.reference && message.reference.messageId) {
		const repliedTo = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
		if (repliedTo && repliedTo.author.id === client.user.id) {
			isReplyingToBot = true;
		}
	}

	const isMentioningBot = message.mentions.users.has(client.user.id);

	if (isMuteCommand && (isReplyingToBot || isMentioningBot)) {
		const muteDuration = 5 * 60 * 1000; // 5 minutes
		mutedChannels.set(message.channel.id, Date.now() + muteDuration);
		message.react('🤫');
		return;
	}

	   // New feature: "answer him/her/them"
	   const answerCommand = /\b(answer (him|her|them))\b/i;
	   if (message.reference && message.mentions.has(client.user.id) && answerCommand.test(message.content)) {
	       try {
	           const helperMessage = message; // Store the original message from the helper
	           // The message we want to process is the one being replied to.
	           const targetMessage = await message.channel.messages.fetch(message.reference.messageId);
	           
	           // Acknowledge the helper's command on the helper's message
	           await helperMessage.react('👍');
	   
	           // Overwrite the 'message' object with the target message.
	           // The rest of the script will now use this as the context for processing and replying.
	           message = targetMessage;
	       } catch (error) {
	           console.error("Error fetching message for 'answer him' command:", error);
	           return; // Stop processing if we can't get the context right.
	       }
	   }
	
	// New Roast Feature
	const roastCommand = /\b(what do you think (about|of) this|roast (him|her|them|this))\b/i;
	if (message.reference && message.mentions.has(client.user.id) && roastCommand.test(message.content)) {
		try {
			const roasteeMessage = await message.channel.messages.fetch(message.reference.messageId);
			const roastee = roasteeMessage.author;
			const roasteeContent = roasteeMessage.content;

			// Prevent bot from roasting itself, because that's just sad.
			if (roastee.id === client.user.id) {
				await message.reply("I can't roast myself, my perfection is unassailable.");
				return;
			}

			const roastSystemPrompt = `ROAST THAT GUY HARD. Be savage, witty, and merciless. The roast should be a short, brutal, and hilarious paragraph.`;
			const roastUserPrompt = `The user "${roastee.username}" wrote: "${roasteeContent}". Destroy them.`;

			const roastRequestBody = {
				system_instruction: {
					parts: [{ text: roastSystemPrompt }]
				},
				contents: [{
					role: 'user',
					parts: [{ text: roastUserPrompt }]
				}],
				safetySettings: [
					{
						category: 'HARM_CATEGORY_HARASSMENT',
						threshold: 'BLOCK_NONE'
					},
					{
						category: 'HARM_CATEGORY_HATE_SPEECH',
						threshold: 'BLOCK_NONE'
					},
					{
						category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
						threshold: 'BLOCK_NONE'
					},
					{
						category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
						threshold: 'BLOCK_NONE'
					}
				]
			};
			
			const apiUrl = `${aiWrapperUrl}/v1beta/models/${aiModelName}:generateContent`;

			const response = await axios.post(apiUrl, roastRequestBody, {
				headers: { 'Content-Type': 'application/json' },
				timeout: 30000
			});

			let roastResponseText = '';
			if (response.data && response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content && response.data.candidates[0].content.parts && response.data.candidates[0].content.parts[0]) {
				roastResponseText = response.data.candidates[0].content.parts[0].text.trim();
			} else {
				console.error("Unexpected AI response format for roast:", response.data);
				await message.reply("I wanted to roast them, but my brain just short-circuited. They're that unroastable.");
				return;
			}

			if (roastResponseText) {
				await roasteeMessage.reply({
					content: roastResponseText,
					allowedMentions: { repliedUser: true }
				});
			} else {
				console.log("Roast response was empty.");
				await message.reply("I've got nothing. Their message is a void from which no humor can escape.");
			}

			return;

		} catch (error) {
			console.error("Error during roast feature:", error);
			await message.reply("I tried to come up with a roast, but I think their message broke my sarcasm module.");
			return;
		}
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

	// Image analysis
	let imageParts = [];
	if (message.attachments.size > 0) {
		for (const attachment of message.attachments.values()) {
			if (attachment.contentType && attachment.contentType.startsWith('image/')) {
				try {
					const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
					const buffer = Buffer.from(response.data, 'binary');
					imageParts.push({
						inline_data: {
							mime_type: attachment.contentType,
							data: buffer.toString('base64')
						}
					});
				} catch (error) {
					console.error('Error fetching or processing image attachment:', error);
				}
			}
		}
	}
	
	if (!userMessage && imageParts.length === 0) return;
	if (userMessage.length < 3 && imageParts.length === 0) return;

	// Fetch last 50 messages for context
	const messageHistory = await message.channel.messages.fetch({ limit: 50 });
	const historyString = (await Promise.all(messageHistory.reverse().map(async m => {
		let content = `${m.author.username}: ${m.content}`;
	
		// Add reply context
		if (m.reference && m.reference.messageId) {
			const repliedTo = await m.channel.messages.fetch(m.reference.messageId).catch(() => null);
			if (repliedTo) {
				content = `${m.author.username} (replying to ${repliedTo.author.username}): ${m.content}`;
			}
		}
	
		if (m.embeds.length > 0) {
			const embed = m.embeds[0];
			content += ` [Embed Content: Title: ${embed.title}, Description: ${embed.description}]`;
		}
		return content;
	}))).join('\n');

	const systemPrompt = `You are the official Pstream Support bot. Your responses MUST be short, concise, and directly to the point. Avoid conversational filler.

Here is your knowledge base (FAQ):
--- FAQ START ---
${faqStringForPrompt}
--- FAQ END ---

Follow these instructions precisely:
1.  **Advanced Social Context Check (VERY IMPORTANT):** The chat history now includes reply context, like "UserA (replying to UserB): message".
	   *   **Human-to-Human Conversation:** If the latest message shows a user replying to another user (who is not you, the bot), it means a conversation is in progress. You MUST NOT respond. Your goal is to avoid interrupting a human who is already helping. In this case, you MUST respond with ONLY the exact text `[IGNORE]` and nothing else.
	   *   **Exception - Bot Mentioned:** If you are explicitly mentioned in a reply (e.g., "@P-stream support or @1366455600925511770"), you MUST respond. Synthesize information from the FAQ to be as helpful as possible, even if it's not a direct match.
	   *   **Replying to the Bot:** If the user is replying to you, you should always process the message.
2.  **Confidence Check (Flexible):** Is the user's question (from text or image) **relevant** to the FAQ? If a clear connection can be made (e.g., "forbidden" and "download" relates to 'download_forbidden'), you should answer. If not, respond with ONLY the exact text `[IGNORE]`. Do not guess.
3.  **Relevance Check:** Only mention a specific solution (like 'FED API') if the user's problem is directly related to it (e.g., slow streaming). Do not offer unsolicited advice.
4.  **Analyze Intent:** Is the user asking a genuine support question about pstream?
	   *   **Forum Post Exception:** If the message is a forum post (Title + Body) and the body is short (e.g., "title says it all"), the Title is the user's question.
	   *   If the message is not a clear support question about pstream, respond with ONLY the exact text `[IGNORE]`.
5.  **Answering:** If the question passes all checks, provide a concise answer based on the FAQ.
	   *   **Safety:** For "is pstream safe?", respond with: "Yes, it is safe. The source code is available on GitHub: <https://github.com/p-stream/p-stream>"
	   *   **Video/Audio Issues:** This is a two-step process.
	       1.  **First-time request:** If the user reports a video/audio issue and you have NOT previously suggested switching sources in the recent history, your response should be: "The primary solution is to switch the video source, as P-stream does not control the media files scraped from providers."
	       2.  **Follow-up request:** If the user's message indicates the first solution's ailed (e.g., "did not work," "what else can I do?"), and you have ALREADY suggested switching sources, your response should be: "If switching sources doesn't help, you can unlock more stable sources by downloading the browser extension or using the CIA API."
	   *   **Website Lag:** For website lag, suggest checking their internet, clearing cache, or enabling 'Low Performance Mode'.
	   *   **Other FAQ Topics:** Answer directly from the FAQ.

Your primary goal is to be a silent, accurate assistant. If in doubt, do not respond.`;

	const userPrompt = `Here is the recent chat history for the channel #${message.channel.name}. Use this to understand the current conversation's context:
--- CHAT HISTORY START ---
${historyString}
--- CHAT HISTORY END ---

The user's latest message is: "${userMessage}"
If the message includes an image, analyze it for extra context. For example, greyed-out sources in a screenshot mean the browser extension is required.`;


	const requestBody = {
		system_instruction: {
			parts: [{ text: systemPrompt }]
		},
		contents: [{
			role: 'user',
			parts: [{ text: userPrompt }, ...imageParts]
		}],
		safetySettings: [
			{
				category: 'HARM_CATEGORY_HARASSMENT',
				threshold: 'BLOCK_NONE'
			},
			{
				category: 'HARM_CATEGORY_HATE_SPEECH',
				threshold: 'BLOCK_NONE'
			},
			{
				category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
				threshold: 'BLOCK_NONE'
			},
			{
				category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
				threshold: 'BLOCK_NONE'
			}
		]
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
	
		
		if (aiResponseText && !aiResponseText.startsWith(ignoreMarker)) {
		          
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
		} else if (aiResponseText.startsWith(ignoreMarker)) {
			         
			         console.log("AI response started with [IGNORE]. No reply sent.");
			     } else {
		          
		          console.log("AI response was empty or an error occurred before processing. No reply sent.");
		      }

	} catch (error) {
		console.error("Error calling AI Wrapper for generation:", error.response ? error.response.data : error.message);
        
		
	}
});



client.login(token);