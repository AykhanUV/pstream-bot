
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

	// Fetch last 50 messages for context
	const messageHistory = await message.channel.messages.fetch({ limit: 50 });
	const historyString = messageHistory.reverse().map(m => {
		let content = `${m.author.username}: ${m.content}`;
		if (m.embeds.length > 0) {
			const embed = m.embeds[0];
			content += ` [Embed Content: Title: ${embed.title}, Description: ${embed.description}]`;
		}
		return content;
	}).join('\n');

	const prompt = `You are a support bot. Your only knowledge base is the FAQ provided.
- If the user's question is answered in the FAQ, provide a short, direct answer.
- If the question is NOT in the FAQ, you MUST respond with only "[IGNORE]".
- If another user is already helping, you MUST respond with only "[IGNORE]".

FAQ:
--- FAQ START ---
${faqStringForPrompt}
--- FAQ END ---

Chat History (for context):
--- CHAT HISTORY START ---
${historyString}
--- CHAT HISTORY END ---

User's latest message: "${userMessage}"`;
	   

	
	const requestBody = {
		contents: [{
			parts: [{ text: prompt }]
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