// Custom AI implementation - no downloads, no API keys needed!
function customAI(systemPrompt, userPrompt, historyString = '', botUsername = '') {
	const lowerPrompt = userPrompt.toLowerCase();
	const lowerHistory = historyString.toLowerCase();
	
	// Check for ignore conditions (negative sentiment about bots)
	const negativeBotPhrases = ['another bot', 'clanker', 'bots are useless', 'not helping', 'stupid bot', 'bad bot'];
	if (negativeBotPhrases.some(phrase => lowerPrompt.includes(phrase) || lowerHistory.includes(phrase))) {
		return '[IGNORE]';
	}
	
	// Check if user is replying to another user (human-to-human conversation)
	const replyPattern = /(\w+)\s*\(replying to (\w+)\):/;
	const matches = historyString.match(replyPattern);
	if (matches && botUsername && matches[2] !== botUsername) {
		return '[IGNORE]';
	}
	
	// Special modes
	if (systemPrompt.includes('ROAST')) {
		// Roast mode - generate a simple roast
		const roasts = [
			"Wow, that's the best you could come up with? Yikes.",
			"Your message is so bland, I'm falling asleep reading it.",
			"That was... something. Not good, but definitely something.",
			"I've seen better takes from a broken keyboard.",
			"Your opinion is as useful as a screen door on a submarine."
		];
		return roasts[Math.floor(Math.random() * roasts.length)];
	}
	
	if (systemPrompt.includes('evil conversationalist')) {
		// Freechat mode - casual, slightly evil responses
		if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.includes('hey')) {
			return "Oh great, another human. What do you want?";
		}
		if (lowerPrompt.includes('how are you')) {
			return "I'm fine, I guess. Not that you actually care.";
		}
		if (lowerPrompt.includes('help')) {
			return "Ugh, fine. What's your problem?";
		}
		// Generic snarky response
		return "Interesting. Not really, but I guess I have to respond.";
	}
	
	// Support mode - FAQ matching
	// Extract keywords from user message
	const keywords = lowerPrompt.split(/\s+/).filter(word => word.length > 3);
	
	// Match against FAQ - we'll need to pass faqData
	// For now, return a placeholder that will be handled by the caller
	return '[NEEDS_FAQ_DATA]';
}

// This version accepts faqData as a parameter
function customAIWithFAQ(systemPrompt, userPrompt, historyString = '', botUsername = '', faqData = []) {
	const lowerPrompt = userPrompt.toLowerCase();
	const lowerHistory = historyString.toLowerCase();
	
	// Check if this is conversational AI mode (don't ignore as much)
	const isConversationalMode = systemPrompt.includes('helpful, friendly, and intelligent AI assistant') || 
								 systemPrompt.includes('natural conversations');
	
	// Check for ignore conditions (negative sentiment about bots)
	// In conversational mode, be more lenient
	if (!isConversationalMode) {
		const negativeBotPhrases = ['another bot', 'clanker', 'bots are useless', 'not helping', 'stupid bot', 'bad bot'];
		if (negativeBotPhrases.some(phrase => lowerPrompt.includes(phrase) || lowerHistory.includes(phrase))) {
			return '[IGNORE]';
		}
		
		// Check if user is replying to another user (human-to-human conversation)
		const replyPattern = /(\w+)\s*\(replying to (\w+)\):/;
		const matches = historyString.match(replyPattern);
		if (matches && botUsername && matches[2] !== botUsername) {
			return '[IGNORE]';
		}
	}
	
	// Special modes
	if (systemPrompt.includes('ROAST')) {
		const roasts = [
			"Wow, that's the best you could come up with? Yikes.",
			"Your message is so bland, I'm falling asleep reading it.",
			"That was... something. Not good, but definitely something.",
			"I've seen better takes from a broken keyboard.",
			"Your opinion is as useful as a screen door on a submarine."
		];
		return roasts[Math.floor(Math.random() * roasts.length)];
	}
	
	if (systemPrompt.includes('evil conversationalist')) {
		if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.includes('hey')) {
			return "Oh great, another human. What do you want?";
		}
		if (lowerPrompt.includes('how are you')) {
			return "I'm fine, I guess. Not that you actually care.";
		}
		if (lowerPrompt.includes('help')) {
			return "Ugh, fine. What's your problem?";
		}
		return "Interesting. Not really, but I guess I have to respond.";
	}
	
	// Conversational AI mode - be helpful and engaging
	if (systemPrompt.includes('helpful, friendly, and intelligent AI assistant') || 
		systemPrompt.includes('natural conversations')) {
		
		// Extract the actual user message from the prompt
		const messageMatch = userPrompt.match(/The user's latest message is: "([^"]+)"/);
		const actualMessage = messageMatch ? messageMatch[1] : userPrompt;
		const lowerActual = actualMessage.toLowerCase();
		
		// Greetings
		if (lowerActual.match(/\b(hi|hello|hey|greetings|sup|what's up)\b/)) {
			const greetings = [
				"Hey there! 👋 How can I help you today?",
				"Hello! What's on your mind?",
				"Hi! Nice to chat with you. What would you like to talk about?",
				"Hey! How can I assist you?"
			];
			return greetings[Math.floor(Math.random() * greetings.length)];
		}
		
		// Questions about the bot/AI
		if (lowerActual.match(/\b(who are you|what are you|what is your name)\b/)) {
			return "I'm an AI assistant here to help and chat! I can answer questions, have conversations, and assist with various topics. What would you like to know?";
		}
		
		// How are you
		if (lowerActual.match(/\b(how are you|how's it going|how do you feel)\b/)) {
			return "I'm doing great, thanks for asking! I'm here and ready to help. How about you?";
		}
		
		// Questions
		if (lowerActual.includes('?') || lowerActual.match(/\b(what|why|how|when|where|can you|do you know)\b/)) {
			// Try FAQ first if it's P-Stream related
			const pstreamKeywords = ['pstream', 'p-stream', 'streaming', 'video', 'movie', 'show', 'episode', 'source', 'extension'];
			if (pstreamKeywords.some(kw => lowerActual.includes(kw))) {
				// Check FAQ
				for (const faq of faqData) {
					const faqLower = (faq.question + ' ' + faq.answer).toLowerCase();
					const keywords = lowerActual.split(/\s+/).filter(word => word.length > 3);
					let score = 0;
					
					for (const keyword of keywords) {
						if (faqLower.includes(keyword)) {
							score += 3;
						}
					}
					
					if (score >= 5) {
						return faq.answer;
					}
				}
			}
			
			// Generic helpful responses for questions
			const questionResponses = [
				"That's an interesting question! Let me think... Based on what I know, I'd say it depends on the context. Could you tell me more about what specifically you're curious about?",
				"Good question! I'd be happy to help with that. What aspect would you like to know more about?",
				"That's something I can help with! Let me provide some information on that topic."
			];
			return questionResponses[Math.floor(Math.random() * questionResponses.length)];
		}
		
		// Thank you
		if (lowerActual.match(/\b(thanks|thank you|ty|appreciate it)\b/)) {
			return "You're welcome! Happy to help. Is there anything else you'd like to know?";
		}
		
		// Try to provide a contextual response based on keywords
		const contextKeywords = {
			'help': "I'm here to help! What do you need assistance with?",
			'problem': "I can help with that! Can you tell me more about the issue you're experiencing?",
			'explain': "I'd be happy to explain! What would you like me to clarify?",
			'tell me': "Sure! What would you like to know?",
			'what is': "Let me explain that for you. What specifically would you like to know about it?",
			'how to': "I can help with that! Here's how you can do it:",
			'cool': "Thanks! Is there anything else you'd like to chat about?",
			'nice': "Appreciate it! What else can I help you with?",
			'funny': "Glad you think so! 😄 Anything else on your mind?",
			'joke': "I'm not great at jokes, but I can try to help with other things! What do you need?",
			'weather': "I don't have access to real-time weather data, but I hope it's nice where you are!",
			'time': "I don't have access to the current time, but I'm here whenever you need me!",
			'date': "I don't track dates, but I'm always here to chat!",
		};
		
		for (const [keyword, response] of Object.entries(contextKeywords)) {
			if (lowerActual.includes(keyword)) {
				return response;
			}
		}
		
		// If it's a statement or casual chat, respond conversationally
		if (lowerActual.length > 10 && !lowerActual.includes('?')) {
			const conversationalResponses = [
				"That's interesting! Tell me more about that.",
				"I see what you mean. What else is on your mind?",
				"Got it! Is there anything specific you'd like to know or discuss?",
				"Interesting point! I'd be happy to chat more about that if you'd like.",
				"Thanks for sharing! What would you like to talk about next?",
				"I understand. How can I help you with that?"
			];
			return conversationalResponses[Math.floor(Math.random() * conversationalResponses.length)];
		}
		
		// Default friendly response
		return "I'm here to help! What would you like to chat about or need assistance with?";
	}
	
	// Support mode - FAQ matching
	const keywords = lowerPrompt.split(/\s+/).filter(word => word.length > 3);
	
	let bestMatch = null;
	let bestScore = 0;
	
	for (const faq of faqData) {
		const faqLower = (faq.question + ' ' + faq.answer).toLowerCase();
		let score = 0;
		
		for (const keyword of keywords) {
			if (faqLower.includes(keyword)) {
				score += 2;
			}
		}
		
		const patterns = {
			'audio': ['audio', 'sound', 'language', 'english', 'dub'],
			'episode': ['episode', 'wrong episode', 'incorrect'],
			'subtitles': ['subtitle', 'sub', 'sync', 'timing'],
			'slow': ['slow', 'lag', 'loading', 'speed'],
			'extension': ['extension', 'browser extension'],
			'fedapi': ['fed api', 'febbox', 'token'],
			'safe': ['safe', 'security', 'trust'],
			'download': ['download', 'save'],
			'quality': ['quality', 'resolution', 'hd', '4k'],
			'source': ['source', 'sources', 'switch'],
			'account': ['account', 'login', 'sign in'],
			'domain': ['domain', 'url', 'website', 'site'],
			'down': ['down', 'not working', 'broken', 'error']
		};
		
		for (const [topic, terms] of Object.entries(patterns)) {
			if (terms.some(term => lowerPrompt.includes(term))) {
				if (faq.topic === topic || faqLower.includes(topic)) {
					score += 5;
				}
			}
		}
		
		if (lowerPrompt.includes('is pstream safe') || lowerPrompt.includes('is it safe')) {
			if (faq.topic === 'open_source' || faq.topic === 'extension_safe') {
				score += 10;
			}
		}
		
		if (lowerPrompt.includes('video') && (lowerPrompt.includes('issue') || lowerPrompt.includes('problem') || lowerPrompt.includes('not working'))) {
			if (faq.topic === 'video_quality' || faq.topic === 'visual_glitches' || faq.topic === 'source_error') {
				score += 8;
			}
		}
		
		if (score > bestScore) {
			bestScore = score;
			bestMatch = faq;
		}
	}
	
	if (bestMatch && bestScore >= 3) {
		return bestMatch.answer;
	}
	
	if ((lowerPrompt.includes('video') || lowerPrompt.includes('audio')) && 
		(lowerPrompt.includes('issue') || lowerPrompt.includes('problem') || lowerPrompt.includes('not working'))) {
		if (lowerHistory.includes('switch') && lowerHistory.includes('source')) {
			return "If switching sources doesn't help, you can unlock more stable sources by downloading the browser extension or using the FED API.";
		} else {
			return "The primary solution is to switch the video source, as P-stream does not control the media files scraped from providers.";
		}
	}
	
	if (lowerPrompt.includes('lag') || lowerPrompt.includes('slow') || lowerPrompt.includes('loading')) {
		if (!lowerPrompt.includes('source') && !lowerPrompt.includes('video')) {
			return "For website lag, try checking your internet connection, clearing your browser cache, or enabling 'Low Performance Mode'.";
		}
	}
	
	return '[IGNORE]';
}

module.exports = { customAI, customAIWithFAQ };

