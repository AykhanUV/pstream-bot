const { ChannelType } = require('discord.js');
const axios = require('axios');
const logger = require('../utils/logger');
const { callAIAPI } = require('../utils/ai');
const { isAllowedChannel, isAIChatChannel } = require('../utils/channels');
const { formatFaqForPrompt } = require('../utils/faq');
const { getCachedResponse, cacheResponse } = require('../utils/cache');

// Clean up Discord formatting issues in AI responses
function cleanDiscordFormatting(text) {
	if (!text) return text;
	
	// Remove markdown headers (#, ##, ###, etc.)
	text = text.replace(/^#{1,6}\s+/gm, '');
	
	// Convert all markdown links to plain URLs: [text](url) -> url
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
	
	// Fix cases where text is directly followed by URL: add space if needed
	// Pattern: "Texthttps://..." -> "Text https://..."
	text = text.replace(/([A-Za-z0-9])(https?:\/\/)/gi, '$1 $2');
	
	return text;
}

const ROAST_SYSTEM_PROMPT = `ROAST THAT GUY HARD. Be savage, witty, and merciless. The roast should be a short, brutal, max 2 sentences, use some sprinkle of vulgarity.

DISCORD FORMATTING:
- NEVER use markdown headers (#, ##, etc.)
- NEVER use markdown links [text](url) - just paste URLs directly
- Use plain URLs: https://example.com
- You can use emojis: 😀 👍 🔥 ✅ ❌ ⚠️ 💡 🎉`;

const EVIL_CASUAL_PROMPT = `You are a casual, slightly evil conversationalist.
- You are NOT a support bot in this mode. You are just hanging out.
- Your personality is witty, sarcastic, and a bit mean (in a fun way).
- If a user says something dumb or acts "brain rotted", roast them mercilessly.
- Be concise. Don't write essays.
- Use slang if appropriate, but keep it readable.
- You can use vulgarity if it fits the "evil" persona.
- Do NOT use [IGNORE]. You are free to chat about anything.
- If asked for help, you can still be helpful, but do it with an attitude.

DISCORD FORMATTING:
- NEVER use markdown headers (#, ##, etc.)
- NEVER use markdown links [text](url) - just paste URLs directly
- Use plain URLs: https://example.com
- You can use emojis: 😀 👍 🔥 ✅ ❌ ⚠️ 💡 🎉`;

// Conversational AI prompt template - FAQ will be injected
function getConversationalAIPrompt(faqString, isPstreamOnly = false) {
	const modeInstruction = isPstreamOnly 
		? "You are in P-Stream only mode. Focus on P-Stream related questions. For other topics, be brief or redirect to P-Stream topics."
		: "You are a general AI chatbot. You can discuss any topic, but you have special knowledge about P-Stream.";
	
	return `${modeInstruction}

Here is your knowledge base (FAQ) for P-Stream:
--- FAQ START ---
${faqString}
--- FAQ END ---

IMPORTANT DISCORD FORMATTING RULES:
- NEVER use markdown headers like #, ##, ###, etc.
- NEVER use markdown links [text](url) - just use plain URLs
- Use plain URLs for all links: https://example.com
- NO EMOJIS - keep it plain text

Guidelines:
- Keep responses VERY SHORT, SIMPLE, and DIRECT - 1-2 sentences max
- No fluff, no emojis, no "I'm sorry to hear" - just the answer
- Be helpful but brief
- Get straight to the point

For P-Stream questions:
- Use the FAQ above to provide accurate information
- If asked about something not in FAQ (like "how to get FED UI cookie"), use your general knowledge to create a VERY SHORT tutorial (2-3 steps max)
- For detailed guides, just mention the solution briefly and link to the full guide
- Example: "Switch video sources via settings cog. For faster speeds, set up Febbox: https://discord.com/channels/..."
- Always link to detailed guides when available in FAQ

For general questions (only if not in P-Stream only mode):
- Answer helpfully but keep it brief
- If you need more info (like location for weather), ask for it
- Be a friendly AI assistant

- Do NOT use [IGNORE] - always try to respond helpfully
- Engage in the conversation naturally based on the chat history
- Be proactive in helping - if someone seems confused, offer additional help or clarification`;
}

function createMessageHandler(client, {
	mutedChannels,
	respondedThreads,
	disabledSupportChannels,
	freeChatChannels,
	roastModeChannels,
	pstreamOnlyChannels,
	managedChannels,
	faqData,
	faqStringForPrompt,
	useCustomAI,
	aiWrapperUrl,
	aiModelName
}) {
	return async (message) => {
		if (message.author.bot) return;

		// Check if channel is managed via /channel command
		const isManagedChannel = managedChannels.has(message.channel.id);
		
		// If channel is managed, use that. Otherwise check default allowed channels
		if (!isManagedChannel && !isAllowedChannel(message.channel)) {
			return;
		}
		
		// If managed channel, set the mode based on managedChannels map
		if (isManagedChannel) {
			const channelMode = managedChannels.get(message.channel.id);
			if (channelMode === 'pstream') {
				pstreamOnlyChannels.add(message.channel.id);
			} else {
				pstreamOnlyChannels.delete(message.channel.id);
			}
		}

		// Check if user mentioned the bot
		const botMentioned = message.mentions.users.has(client.user.id);
		
		// In P-Stream only mode (and not AI chat channel), only respond if:
		// 1. User mentioned the bot, OR
		// 2. It's a P-Stream related question (we'll check this later)
		const isPstreamOnlyMode = pstreamOnlyChannels.has(message.channel.id) && !isAIChatChannel(message.channel);
		
		// For P-Stream only mode, ignore non-P-Stream questions unless pinged
		if (isPstreamOnlyMode && !botMentioned) {
			// Quick check: if it's clearly not P-Stream related and not a ping, ignore
			const lowerMessage = message.content.toLowerCase();
			const pstreamKeywords = ['pstream', 'p-stream', 'streaming', 'video', 'movie', 'show', 'episode', 'source', 'extension', 'febbox', 'fed api', 'subtitle', 'download', 'account', 'proxy'];
			const isPstreamRelated = pstreamKeywords.some(keyword => lowerMessage.includes(keyword));
			
			// Also check for common non-P-Stream questions
			const nonPstreamQuestions = ['weather', 'time', 'date', 'joke', 'tell me a story', 'what is', 'who is', 'when is'];
			const isNonPstreamQuestion = nonPstreamQuestions.some(q => lowerMessage.includes(q));
			
			if (isNonPstreamQuestion && !isPstreamRelated) {
				logger.debug(`Ignoring non-P-Stream question in P-Stream only mode: ${message.content.substring(0, 50)}`);
				return;
			}
		}

		// Check if support is disabled for this channel (and not in a special mode)
		// AI chat channel always works regardless of support settings
		if (!isAIChatChannel(message.channel) &&
			disabledSupportChannels.has(message.channel.id) && 
			!freeChatChannels.has(message.channel.id) && 
			!roastModeChannels.has(message.channel.id)) {
			return;
		}

		// Check if the channel is muted
		if (mutedChannels.has(message.channel.id) && mutedChannels.get(message.channel.id) > Date.now()) {
			return;
		}

		// Check if the bot has already responded in this thread
		// Skip this check for AI chat channel - it should always be able to respond
		if (!isAIChatChannel(message.channel) && 
			message.channel.isThread() && 
			respondedThreads.has(message.channel.id) && 
			!message.mentions.has(client.user.id)) {
			return;
		}

		// Check for mute commands
		const lowerCaseMessage = message.content.toLowerCase();
		const isMuteCommand = lowerCaseMessage.includes('shut up stupid bot') || lowerCaseMessage.includes('bot be quiet');
		
		let isReplyingToBot = false;
		if (message.reference && message.reference.messageId) {
			const repliedTo = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
			if (repliedTo && repliedTo.author.id === client.user.id) {
				isReplyingToBot = true;
			}
		}

		if (isMuteCommand && (isReplyingToBot || botMentioned)) {
			const muteDuration = 5 * 60 * 1000; // 5 minutes
			mutedChannels.set(message.channel.id, Date.now() + muteDuration);
			message.react('🤫');
			logger.info(`Channel ${message.channel.name} muted for 5 minutes`);
			return;
		}

		// "answer him/her/them" feature
		const answerCommand = /\b(answer (him|her|them))\b/i;
		if (message.reference && message.mentions.has(client.user.id) && answerCommand.test(message.content)) {
			try {
				const helperMessage = message;
				const targetMessage = await message.channel.messages.fetch(message.reference.messageId);
				
				await helperMessage.react('👍');
				logger.info(`Answer command triggered by ${message.author.username}`);
				
				message = targetMessage;
			} catch (error) {
				logger.error("Error fetching message for 'answer him' command:", error);
				return;
			}
		}

		// Roast Feature
		const roastCommand = /\b(what do you think (about|of) this|roast (him|her|them|this))\b/i;
		if (message.reference && message.mentions.has(client.user.id) && roastCommand.test(message.content)) {
			try {
				const roasteeMessage = await message.channel.messages.fetch(message.reference.messageId);
				const roastee = roasteeMessage.author;
				const roasteeContent = roasteeMessage.content;

				if (roastee.id === client.user.id) {
					await message.reply("I can't roast myself, my perfection is unassailable.");
					return;
				}

				logger.command(`Roast requested by ${message.author.username} for ${roastee.username}`);

				const roastSystemPrompt = ROAST_SYSTEM_PROMPT;
				const roastUserPrompt = `The user "${roastee.username}" wrote: "${roasteeContent}". Destroy them.`;

				let roastResponseText = '';
				try {
					roastResponseText = await callAIAPI(roastSystemPrompt, roastUserPrompt);
				} catch (error) {
					logger.error("Error during roast API call:", error);
					await message.reply("I wanted to roast them, but my brain just short-circuited. They're that unroastable.");
					return;
				}

				if (roastResponseText) {
					await roasteeMessage.reply({
						content: roastResponseText,
						allowedMentions: { repliedUser: true }
					});
					logger.ai(`Roast delivered: ${roastResponseText.substring(0, 50)}...`);
				} else {
					logger.warn("Roast response was empty.");
					await message.reply("I've got nothing. Their message is a void from which no humor can escape.");
				}

				return;
			} catch (error) {
				logger.error("Error during roast feature:", error);
				await message.reply("I tried to come up with a roast, but I think their message broke my sarcasm module.");
				return;
			}
		}

		// Skip if using custom AI (doesn't need these)
		if (!useCustomAI && (!aiWrapperUrl || !aiModelName)) {
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
						logger.debug(`Fetching image attachment: ${attachment.name} (${attachment.size} bytes)`);
						
						// Check file size (limit to 20MB for Gemini)
						if (attachment.size > 20 * 1024 * 1024) {
							logger.warn(`Image ${attachment.name} is too large (${attachment.size} bytes), skipping`);
							continue;
						}
						
						const response = await axios.get(attachment.url, { 
							responseType: 'arraybuffer',
							timeout: 10000,
							maxContentLength: 20 * 1024 * 1024
						});
						const buffer = Buffer.from(response.data, 'binary');
						
						// Check if buffer is reasonable size
						if (buffer.length > 20 * 1024 * 1024) {
							logger.warn(`Image ${attachment.name} buffer too large, skipping`);
							continue;
						}
						
						imageParts.push({
							inline_data: {
								mime_type: attachment.contentType,
								data: buffer.toString('base64')
							}
						});
						logger.debug(`Successfully processed image attachment: ${attachment.name}`);
					} catch (error) {
						logger.error('Error fetching or processing image attachment:', error);
						// Continue without this image rather than failing completely
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

		let systemPrompt;

		// Check if this is the AI chat channel - use conversational AI with FAQ
		if (isAIChatChannel(message.channel)) {
			const isPstreamOnly = pstreamOnlyChannels.has(message.channel.id);
			systemPrompt = getConversationalAIPrompt(faqStringForPrompt, isPstreamOnly);
		} else if (roastModeChannels.has(message.channel.id)) {
			systemPrompt = ROAST_SYSTEM_PROMPT;
		} else if (freeChatChannels.has(message.channel.id)) {
			systemPrompt = EVIL_CASUAL_PROMPT;
		} else {
			const isPstreamOnly = pstreamOnlyChannels.has(message.channel.id);
			const modeNote = isPstreamOnly 
				? "You are in P-Stream only mode. Focus on P-Stream questions."
				: "You are a support bot but can help with general questions if relevant.";
			
			systemPrompt = `You are the official Pstream Support bot. ${modeNote}

Here is your knowledge base (FAQ):
--- FAQ START ---
${faqStringForPrompt}
--- FAQ END ---

CRITICAL: Keep responses VERY SHORT and DIRECT - 1-2 sentences max. No fluff, no emojis, no apologies. Just the answer.

For questions not in FAQ (like "how to get FED UI cookie"):
- Use your knowledge to create a VERY SHORT tutorial (2-3 steps max)
- Then link to detailed guide
- Example: "Open dev tools (F12) > Application > Cookies > copy UI value. Guide: [link]"

IMPORTANT DISCORD FORMATTING RULES:
- NEVER use markdown headers like #, ##, ###, etc.
- NEVER use markdown links [text](url) - just use plain URLs
- Use plain URLs for all links: https://example.com
- NO EMOJIS - keep it plain text

Follow these instructions precisely:
1.  **Negative Sentiment Filter (CRITICAL):** If the user's message expresses frustration, criticism, or negativity about bots in general (e.g., "ahh another bot", "not another clanker", "bots are useless", "this is not helping"), you MUST respond with [IGNORE]. Do NOT engage with criticism or negative comments about bots. Silently ignore these messages.
2.  **Advanced Social Context Check (VERY IMPORTANT):** The chat history now includes reply context, like "UserA (replying to UserB): message".
	   *   **Human-to-Human Conversation:** If the latest message shows a user replying to another user (who is not you, the bot), it means a conversation is in progress. You MUST NOT respond. Your goal is to avoid interrupting a human who is already helping. In this case, respond with [IGNORE].
	   *   **Exception - Bot Mentioned:** If you are explicitly mentioned in a reply (e.g., "@P-stream support or @1366455600925511770"), you MUST respond. Synthesize information from the FAQ to be as helpful as possible, even if it's not a direct match.
	   *   **Replying to the Bot:** If the user is replying to you, you should always process the message.
3.  **Confidence Check (Flexible):** Is the user's question (from text or image) **relevant** to the FAQ? If a clear connection can be made (e.g., "forbidden" and "download" relates to 'download_forbidden'), you should answer. If not, respond with [IGNORE]. Do not guess.
4.  **Relevance Check:** Only mention a specific solution (like 'FED API') if the user's problem is directly related to it (e.g., slow streaming). Do not offer unsolicited advice.
5.  **Analyze Intent:** Is the user asking a genuine support question about pstream?
	   *   **Forum Post Exception:** If the message is a forum post (Title + Body) and the body is short (e.g., "title says it all"), the Title is the user's question.
	   *   If the message is not a clear support question about pstream, respond with [IGNORE].
6.  **Answering:** If the question passes all checks, provide a VERY SHORT answer based on the FAQ (1-2 sentences max).
	   *   **Safety:** For "is pstream safe?", respond with: "Yes, it is safe. Source code: https://github.com/p-stream/p-stream"
	   *   **Video/Audio Issues:** This is a two-step process.
	       1.  **First-time request:** If the user reports a video/audio issue and you have NOT previously suggested switching sources in the recent history, your response should be: "Switch video sources via settings cog."
	       2.  **Follow-up request:** If the user's message indicates the first solution failed, and you have ALREADY suggested switching sources, your response should be: "Try the browser extension or FED API for more stable sources."
	   *   **Website Lag:** For website lag: "Check internet, clear cache, or enable Low Performance Mode."
	   *   **Other FAQ Topics:** Answer directly from the FAQ, but keep it SHORT (1-2 sentences).

Your primary goal is to be a silent, accurate assistant. If in doubt, do not respond.`;
		}

		const userPrompt = `Here is the recent chat history for the channel #${message.channel.name}. Use this to understand the current conversation's context:
--- CHAT HISTORY START ---
${historyString}
--- CHAT HISTORY END ---

The user's latest message is: "${userMessage}"
If the message includes an image, analyze it for extra context. For example, greyed-out sources in a screenshot mean the browser extension is required.`;

		try {
			logger.ai(`Processing message from ${message.author.username}: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
			
			// Check cache first
			const cacheKey = `${message.channel.id}:${systemPrompt}`;
			let aiResponseText = getCachedResponse(userMessage, message.channel.id, systemPrompt);
			let isCached = false;
			
			if (aiResponseText) {
				logger.success(`Using cached response for ${message.author.username}`);
				isCached = true;
			} else {
				// Call AI API if not cached
				aiResponseText = await callAIAPI(systemPrompt, userPrompt, imageParts);
				
				// Cache the response for future use
				cacheResponse(userMessage, message.channel.id, systemPrompt, aiResponseText);
				logger.ai(`AI Response: ${aiResponseText.substring(0, 100)}${aiResponseText.length > 100 ? '...' : ''}`);
			}

			const ignoreMarker = "[IGNORE]";
			
			const isAIChat = isAIChatChannel(message.channel);
			const isSpecialMode = freeChatChannels.has(message.channel.id) || roastModeChannels.has(message.channel.id) || isAIChat;
			const shouldRespond = isSpecialMode || (aiResponseText && !aiResponseText.startsWith(ignoreMarker));

			if (shouldRespond) {
				let finalResponseText = aiResponseText;
				if (isSpecialMode && finalResponseText.startsWith(ignoreMarker)) {
					finalResponseText = finalResponseText.replace(ignoreMarker, "").trim();
				}

				if (finalResponseText) {
					// Clean up Discord formatting issues
					finalResponseText = cleanDiscordFormatting(finalResponseText);
					
					// Build footer with user mention
					let footer = "";
					if (isCached) {
						footer = `\n-# This content is AI Generated and Cached. | Requested: ${message.author}`;
					} else if (isAIChat) {
						footer = `\n-# This is AI generated, may not be accurate | Requested: ${message.author}`;
					} else {
						footer = `\n-# This is AI generated, and may not be accurate. | Requested: ${message.author}`;
					}
					
					const finalResponse = finalResponseText + footer;

					// Small delay for cached responses to make it feel instant
					if (!isCached) {
						await message.channel.sendTyping();
					}
					
					try {
						await message.reply({
							content: finalResponse,
							allowedMentions: { users: [message.author.id] }
						});
						
						if (message.channel.isThread()) {
							respondedThreads.add(message.channel.id);
						}
						
						logger.success(`Response sent to ${message.author.username} in ${message.channel.name}`);
					} catch (replyError) {
						// Handle cases where message was deleted or channel is inaccessible
						if (replyError.code === 50035 || replyError.code === 10008) {
							logger.debug(`Could not reply to message (message/channel may have been deleted): ${message.id}`);
						} else {
							logger.error(`Error sending reply:`, replyError);
						}
					}
				}
			} else if (aiResponseText.startsWith(ignoreMarker)) {
				logger.debug("AI response was [IGNORE]. No reply sent.");
			} else {
				logger.debug("AI response was empty or an error occurred before processing. No reply sent.");
			}

		} catch (error) {
			logger.error("Error calling AI API for generation:", error);
			
			// Handle rate limit errors gracefully
			if (error.response && error.response.status === 429) {
				try {
					// Check if message still exists before replying
					await message.fetch().catch(() => null);
					if (message.deleted) {
						logger.debug("Message was deleted, skipping rate limit reply");
						return;
					}
					await message.reply({
						content: "I'm being rate limited right now. Please try again in a moment.",
						allowedMentions: { users: [message.author.id] }
					});
				} catch (replyError) {
					// If reply fails (e.g., message deleted, channel deleted), just log it
					if (replyError.code === 50035 || replyError.code === 10008) {
						logger.debug("Could not send rate limit message (message/channel may have been deleted)");
					} else {
						logger.error("Error sending rate limit message:", replyError);
					}
				}
				return;
			}
			
			// Handle image processing errors
			if (imageParts.length > 0 && error.message && error.message.includes('image')) {
				logger.warn("Image processing failed, retrying without image");
				try {
					// Retry without image
					const aiResponseText = await callAIAPI(systemPrompt, userPrompt, []);
					// Process response normally
					const ignoreMarker = "[IGNORE]";
					const isAIChat = isAIChatChannel(message.channel);
					const isSpecialMode = freeChatChannels.has(message.channel.id) || roastModeChannels.has(message.channel.id) || isAIChat;
					const shouldRespond = isSpecialMode || (aiResponseText && !aiResponseText.startsWith(ignoreMarker));
					
					if (shouldRespond) {
						let finalResponseText = aiResponseText;
						if (isSpecialMode && finalResponseText.startsWith(ignoreMarker)) {
							finalResponseText = finalResponseText.replace(ignoreMarker, "").trim();
						}
						
						if (finalResponseText) {
							finalResponseText = cleanDiscordFormatting(finalResponseText);
							let footer = "";
							if (isAIChat) {
								footer = `\n-# This is AI generated, may not be accurate | Requested: ${message.author}`;
							} else {
								footer = `\n-# This is AI generated, and may not be accurate. | Requested: ${message.author}`;
							}
							const finalResponse = finalResponseText + footer;
							
							if (!isCached) {
								await message.channel.sendTyping();
							}
							
							await message.reply({
								content: finalResponse,
								allowedMentions: { users: [message.author.id] }
							});
							
							if (message.channel.isThread()) {
								respondedThreads.add(message.channel.id);
							}
							
							logger.success(`Response sent to ${message.author.username} in ${message.channel.name} (without image)`);
						}
					}
					return;
				} catch (retryError) {
					logger.error("Error on retry without image:", retryError);
				}
			}
		}
	};
}

module.exports = { createMessageHandler };

