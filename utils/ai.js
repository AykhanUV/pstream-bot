const axios = require('axios');
const logger = require('./logger');
const { customAIWithFAQ } = require('./customAI');

let config = null;
let client = null;
let faqData = [];

function initialize(conf, discordClient, faq) {
	config = conf;
	client = discordClient;
	faqData = faq;
}

// Helper function to build API request headers
function buildApiHeaders() {
	const headers = { 'Content-Type': 'application/json' };
	
	if (!isOllama() && config.apiKey && config.apiKey.trim() !== '') {
		headers['x-goog-api-key'] = config.apiKey;
	}
	
	return headers;
}

function isOllama() {
	// Only check for Ollama if explicitly set or URL contains 'ollama'
	// Don't treat all localhost URLs as Ollama (could be a Gemini wrapper)
	if (config.useOllama === true) {
		return true;
	}
	
	const hasCustomBaseUrl = config.aiWrapperUrl && config.aiWrapperUrl.trim() !== '';
	const aiWrapperUrl = hasCustomBaseUrl ? config.aiWrapperUrl : 'https://generativelanguage.googleapis.com';
	
	// Only consider it Ollama if URL explicitly contains 'ollama' or port 11434 (default Ollama port)
	return aiWrapperUrl.includes('ollama') || aiWrapperUrl.includes(':11434');
}

function useCustomAI() {
	return config.useCustomAI === true;
}

// Helper function to convert Gemini format to Ollama format
function convertToOllamaFormat(systemPrompt, userPrompt, imageParts = []) {
	let promptText = userPrompt;
	if (imageParts.length > 0) {
		promptText += '\n[Note: This message includes image attachments. Please analyze them if your model supports vision.]';
	}
	
	return {
		model: config.aiModelName,
		prompt: promptText,
		system: systemPrompt || '',
		stream: false
	};
}

// Helper function to call AI API (supports Gemini, Ollama, and Custom AI)
async function callAIAPI(systemPrompt, userPrompt, imageParts = []) {
	logger.ai(`Processing AI request (Custom: ${useCustomAI()}, Ollama: ${isOllama()})`);
	
	// Use custom AI if enabled (no downloads, no API keys!)
	if (useCustomAI()) {
		const historyMatch = userPrompt.match(/--- CHAT HISTORY START ---\n([\s\S]*?)\n--- CHAT HISTORY END ---/);
		const historyString = historyMatch ? historyMatch[1] : '';
		const botUsername = client.user ? client.user.username : '';
		return customAIWithFAQ(systemPrompt, userPrompt, historyString, botUsername, faqData);
	}
	
	if (isOllama()) {
		const ollamaRequestBody = convertToOllamaFormat(systemPrompt, userPrompt, imageParts);
		const OLLAMA_BASE_URL = config.ollamaUrl || 'http://localhost:11434';
		const ollamaUrl = `${OLLAMA_BASE_URL}/api/generate`;
		
		logger.debug(`Calling Ollama at ${ollamaUrl}`);
		
		// Retry logic for rate limits
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const response = await axios.post(ollamaUrl, ollamaRequestBody, {
					headers: { 'Content-Type': 'application/json' },
					timeout: 60000
				});
				
				if (response.data && response.data.response) {
					logger.ai('Ollama response received');
					return response.data.response.trim();
				}
				throw new Error('Unexpected Ollama response format');
			} catch (error) {
				lastError = error;
				// Check if it's a rate limit error (429)
				if (error.response && error.response.status === 429) {
					const retryAfter = error.response.headers['retry-after'] || Math.pow(2, attempt);
					const waitTime = parseInt(retryAfter) * 1000;
					logger.warn(`Rate limited (429). Waiting ${waitTime/1000}s before retry ${attempt + 1}/3`);
					await new Promise(resolve => setTimeout(resolve, waitTime));
					continue; // Retry
				}
				// For other errors, throw immediately
				throw error;
			}
		}
		// If all retries failed, throw the last error
		throw lastError;
	} else {
		// Use Gemini API format
		const hasCustomBaseUrl = config.aiWrapperUrl && config.aiWrapperUrl.trim() !== '';
		const DEFAULT_API_BASE_URL = 'https://generativelanguage.googleapis.com';
		const aiWrapperUrl = hasCustomBaseUrl ? config.aiWrapperUrl : DEFAULT_API_BASE_URL;
		
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
		
		const apiUrl = `${aiWrapperUrl}/v1beta/models/${config.aiModelName}:generateContent`;
		
		logger.debug(`Calling Gemini API at ${apiUrl}`);
		
		// Retry logic for rate limits
		let lastError = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const response = await axios.post(apiUrl, requestBody, {
					headers: buildApiHeaders(),
					timeout: 30000
				});
				
				if (response.data && response.data.candidates && response.data.candidates[0] && 
					response.data.candidates[0].content && response.data.candidates[0].content.parts && 
					response.data.candidates[0].content.parts[0]) {
					logger.ai('Gemini API response received');
					return response.data.candidates[0].content.parts[0].text.trim();
				}
				throw new Error('Unexpected AI response format');
			} catch (error) {
				lastError = error;
				// Check if it's a rate limit error (429)
				if (error.response && error.response.status === 429) {
					const retryAfter = error.response.headers['retry-after'] || Math.pow(2, attempt);
					const waitTime = parseInt(retryAfter) * 1000;
					logger.warn(`Rate limited (429). Waiting ${waitTime/1000}s before retry ${attempt + 1}/3`);
					await new Promise(resolve => setTimeout(resolve, waitTime));
					continue; // Retry
				}
				// For other errors, throw immediately
				throw error;
			}
		}
		// If all retries failed, throw the last error
		throw lastError;
	}
}

module.exports = {
	initialize,
	callAIAPI,
	isOllama,
	useCustomAI
};

