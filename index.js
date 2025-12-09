const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const config = require('./config.json');
const logger = require('./utils/logger');
const { loadFAQ, formatFaqForPrompt } = require('./utils/faq');
const { initialize: initializeAI } = require('./utils/ai');
const { loadCommands } = require('./handlers/commandHandler');
const { createMessageHandler } = require('./handlers/messageHandler');
const { hasPermission } = require('./utils/permissions');

// Initialize state
const mutedChannels = new Map();
const respondedThreads = new Set();
const disabledSupportChannels = new Set();
const freeChatChannels = new Set();
const roastModeChannels = new Set();
const pstreamOnlyChannels = new Set(); // Channels in P-Stream only mode
const managedChannels = new Map(); // Channels managed via /channel command: channelId -> mode ('pstream' or 'general')

// Load FAQ
const faqData = loadFAQ();
const faqStringForPrompt = formatFaqForPrompt(faqData);

// Check if custom base URL is provided
const hasCustomBaseUrl = config.aiWrapperUrl && config.aiWrapperUrl.trim() !== '';
const DEFAULT_API_BASE_URL = 'https://generativelanguage.googleapis.com';
const aiWrapperUrl = hasCustomBaseUrl ? config.aiWrapperUrl : DEFAULT_API_BASE_URL;
const useCustomAI = config.useCustomAI === true;

// Create Discord client
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	]
});

// Load commands
const commands = loadCommands();
client.commands = commands;

// Initialize AI
initializeAI(config, client, faqData);

// State object to pass to handlers
const state = {
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
	aiModelName: config.aiModelName
};

// Client ready event
client.once(Events.ClientReady, c => {
	logger.success(`Ready! Logged in as ${c.user.tag}`);
	logger.info(`Bot is in ${c.guilds.cache.size} guild(s)`);

	// Validate API configuration
	const hasApiKey = config.apiKey && config.apiKey.trim() !== '';

	if (useCustomAI) {
		logger.info("Using Custom AI (no downloads, no API keys needed!)");
		logger.info("This is a simple pattern-matching AI that uses your FAQ for responses.");
	} else {
		const isOllama = aiWrapperUrl.includes('localhost') || 
						 aiWrapperUrl.includes('127.0.0.1') || 
						 aiWrapperUrl.includes('ollama') || 
						 config.useOllama === true;
		
		if (isOllama) {
			const OLLAMA_BASE_URL = config.ollamaUrl || 'http://localhost:11434';
			logger.info(`Using Ollama (free, local AI) at ${OLLAMA_BASE_URL} with model: ${config.aiModelName}`);
			logger.info("No API key required! Make sure Ollama is running and the model is installed.");
			logger.info(`To install a model, run: ollama pull ${config.aiModelName}`);
		} else {
			if (!hasCustomBaseUrl && !hasApiKey) {
				logger.error("CONFIGURATION ERROR: API key is REQUIRED when custom base URL is not provided.");
				logger.error("Please add an 'apiKey' field to your config.json file.");
				logger.error("Or use Custom AI (free, no API key) by setting 'useCustomAI': true in config.json");
				logger.error("Bot will not respond to AI requests until this is fixed.");
				process.exit(1);
			}

			if (!hasCustomBaseUrl && hasApiKey) {
				logger.info("Using default API endpoint with API key authentication.");
			} else if (hasCustomBaseUrl && hasApiKey) {
				logger.info(`Using custom base URL (${aiWrapperUrl}) with API key authentication.`);
			} else if (hasCustomBaseUrl && !hasApiKey) {
				logger.info(`Using custom base URL (${aiWrapperUrl}) without API key authentication.`);
			}
		}
	}

	if (!config.aiModelName && !useCustomAI) {
		logger.warn("AI Model Name missing in config.json. AI features will be disabled.");
	}
});

// Error handling
client.on(Events.Error, error => {
	logger.error('A client error occurred:', error);
});

// Interaction (slash command) handler
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		logger.warn(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	// Check permissions
	if (!hasPermission(interaction.member)) {
		logger.warn(`User ${interaction.user.username} attempted to use ${interaction.commandName} without permission`);
		await interaction.reply({ 
			content: 'You do not have permission to use this command.', 
			ephemeral: true 
		});
		return;
	}

	try {
		logger.command(`Executing ${interaction.commandName} by ${interaction.user.username}`);
		await command.execute(interaction, state);
	} catch (error) {
		logger.error(`Error executing ${interaction.commandName}:`, error);
		
		const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
		
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(errorMessage);
		} else {
			await interaction.reply(errorMessage);
		}
	}
});

// Message handler
const messageHandler = createMessageHandler(client, state);
client.on(Events.MessageCreate, messageHandler);

// Login
client.login(config.token).catch(error => {
	logger.error('Failed to login:', error);
	process.exit(1);
});
