const fs = require('node:fs').promises;
const path = require('node:path');
const axios = require('axios');
const { Client, Events, GatewayIntentBits, ChannelType } = require('discord.js');

// Configuration and constants
class Config {
    constructor() {
        try {
            const config = require('./config.json');
            this.token = config.token;
            this.aiWrapperUrl = config.aiWrapperUrl;
            this.aiModelName = config.aiModelName;
            this.clientId = config.clientId;
        } catch (error) {
            console.error('Error loading config.json:', error);
            process.exit(1);
        }
    }

    isAiEnabled() {
        return this.aiWrapperUrl && this.aiModelName;
    }
}

class BotConstants {
    static ALLOWED_CHANNELS = ['general', 'ipa-exe-app-support', 'bot-commands'];
    static ALLOWED_FORUMS = ['issues-and-bugs'];
    static SUPPORT_COMMAND_ROLES = ['P-Stream Team', 'Perms'];
    static SUPPORT_COMMAND_USERS = ['shikaliyev_15'];
    static MUTE_DURATION = 5 * 60 * 1000;
    static MESSAGE_HISTORY_LIMIT = 30;
    static AI_TIMEOUT = 25000;
    static CACHE_CLEANUP_INTERVAL = 10 * 60 * 1000;
    static MAX_CACHE_SIZE = 100;
    static ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
}

// Enhanced caching system (messageCache removed)
class BotCache {
    constructor() {
        this.mutedChannels = new Map();
        this.respondedThreads = new Set();
        this.disabledSupportChannels = new Set();
        // messageCache removed - was unused
        this.faqData = [];
        this.faqString = '';
        
        // Store interval reference for proper cleanup
        this.cleanupInterval = setInterval(() => this.cleanup(), BotConstants.CACHE_CLEANUP_INTERVAL);
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.cleanup();
        console.log('BotCache destroyed');
    }

    cleanup() {
        // Clean expired mutes
        const now = Date.now();
        for (const [channelId, expiry] of this.mutedChannels.entries()) {
            if (expiry < now) {
                this.mutedChannels.delete(channelId);
            }
        }

        // Limit responded threads cache size
        if (this.respondedThreads.size > BotConstants.MAX_CACHE_SIZE) {
            const threadsArray = Array.from(this.respondedThreads);
            this.respondedThreads.clear();
            threadsArray.slice(-50).forEach(id => this.respondedThreads.add(id));
        }

        // messageCache cleanup removed - was unused
        console.log('Cache cleanup completed');
    }

    async loadFaq() {
        try {
            const faqPath = path.join(__dirname, 'faq.json');
            const data = await fs.readFile(faqPath, 'utf8');
            this.faqData = JSON.parse(data);
            this.faqString = this.formatFaqForPrompt(this.faqData);
            console.log(`Loaded ${this.faqData.length} FAQ items`);
        } catch (error) {
            console.error('Error loading FAQ:', error);
            this.faqData = [];
            this.faqString = '';
        }
    }

    formatFaqForPrompt(faqItems) {
        return faqItems
            .map(item => `Q: ${item.question}\nA: ${item.answer}`)
            .join('\n\n');
    }
}

// Rate limiting for AI requests
class RateLimiter {
    constructor(maxRequests = 10, windowMs = 60000) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    canMakeRequest(channelId) {
        const now = Date.now();
        const requests = this.requests.get(channelId) || [];
        
        // Remove old requests
        const recentRequests = requests.filter(time => now - time < this.windowMs);
        this.requests.set(channelId, recentRequests);
        
        return recentRequests.length < this.maxRequests;
    }

    recordRequest(channelId) {
        const requests = this.requests.get(channelId) || [];
        requests.push(Date.now());
        this.requests.set(channelId, requests);
    }
}

// Enhanced AI service with proper cleanup
class AIService {
    constructor(config) {
        this.config = config;
        this.rateLimiter = new RateLimiter();

        this.client = axios.create({
            timeout: BotConstants.AI_TIMEOUT,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Add cleanup method for proper memory management
    destroy() {
        if (this.rateLimiter) {
            this.rateLimiter.requests.clear();
        }
        console.log('AIService destroyed');
    }

    getSystemInstruction() {
        // Centralize the bot policy and response style in system-instruction
        return [
            'You are the official P-Stream Support bot.',
            'Provide short, accurate responses only.',
            'Respond with [IGNORE] if uncertain or off-topic.',
            'Safety questions: "Yes, P-Stream is safe. Source code available."',
            'Video/Audio issues: "Switch video sources in player settings. P-Stream doesn\'t control scraped media files."',
            'If sources don\'t help: "Try the browser extension or FED API for more stable sources."',
            'Website lag: "Check internet, clear cache, or enable Low Performance Mode."',
            'Use FAQ answers for other topics.',
            'No conversational filler.',
        ].join('\n');
    }

    getSafetySettings() {
        return [
            { category: 'HARM_CATEGORY_HARASSMENT',          threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',         threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',   threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',   threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY',     threshold: 'BLOCK_ONLY_HIGH' },
        ];
    }

    async generateResponse(prompt, imageParts = [], channelId) {
        if (!this.config.isAiEnabled()) {
            throw new Error('AI service not configured');
        }

        if (!this.rateLimiter.canMakeRequest(channelId)) {
            throw new Error('Rate limit exceeded');
        }

        const requestBody = {
            // New: separate policy from user content
            system_instruction: {
                parts: [{ text: this.getSystemInstruction() }],
            },
            contents: [{
                role: 'user',
                parts: [{ text: prompt }, ...imageParts],
            }],
            safetySettings: this.getSafetySettings(),
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.3,
                response_mime_type: 'text/plain',
            }
        };

        const apiUrl = `${this.config.aiWrapperUrl}/v1beta/models/${this.config.aiModelName}:generateContent`;

        // Light retry on transient failures
        const maxAttempts = 3;
        let lastErr;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.rateLimiter.recordRequest(channelId);
                const response = await this.client.post(apiUrl, requestBody);
                return this.extractResponseText(response.data);
            } catch (error) {
                if (error.code === 'ECONNABORTED') {
                    lastErr = new Error('AI request timeout');
                } else if (error.response && [500, 502, 503, 504].includes(error.response.status)) {
                    lastErr = error;
                } else {
                    throw error;
                }
                if (attempt < maxAttempts) {
                    const backoff = 400 * Math.pow(2, attempt - 1);
                    await new Promise(res => setTimeout(res, backoff));
                    continue;
                }
                throw lastErr;
            }
        }
    }

    extractResponseText(responseData) {
        const candidate = responseData?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const textPart = parts.find(p => typeof p.text === 'string' && p.text.length > 0);
        if (!textPart) {
            throw new Error('Invalid AI response format');
        }
        return textPart.text.trim();
    }
}

// Enhanced message handler
class MessageHandler {
    constructor(client, cache, aiService) {
        this.client = client;
        this.cache = cache;
        this.aiService = aiService;
    }

    async handleMessage(message) {
        try {
            if (message.author.bot) return;

            // Early permission checks
            if (!this.isAllowedChannel(message)) return;
            if (!this.hasChannelPermissions(message)) return;
            if (this.isChannelMuted(message)) return;

            // Handle support commands
            if (await this.handleSupportCommands(message)) return;

            // Handle mute commands
            if (await this.handleMuteCommands(message)) return;

            // Handle "answer him/her/them" feature
            const targetMessage = await this.handleAnswerCommand(message);
            if (targetMessage) {
                message = targetMessage;
            }

            // Process AI response
            await this.processAIResponse(message);

        } catch (error) {
            console.error('Error handling message:', error);
            // Don't reply to avoid spam on errors
        }
    }

    isAllowedChannel(message) {
        const channelName = message.channel.name;
        const parentChannelName = message.channel.isThread() ? message.channel.parent?.name : null;
        
        return BotConstants.ALLOWED_CHANNELS.includes(channelName) || 
               BotConstants.ALLOWED_FORUMS.includes(parentChannelName);
    }

    hasChannelPermissions(message) {
        if (this.cache.disabledSupportChannels.has(message.channel.id)) {
            return false;
        }

        if (message.channel.isThread() && 
            this.cache.respondedThreads.has(message.channel.id) && 
            !message.mentions.has(this.client.user.id)) {
            return false;
        }

        return true;
    }

    isChannelMuted(message) {
        const mutedUntil = this.cache.mutedChannels.get(message.channel.id);
        return mutedUntil && mutedUntil > Date.now();
    }

    async handleSupportCommands(message) {
        if (!message.content.startsWith('-support')) return false;

        const hasPermission = this.hasAdminPermission(message);
        if (!hasPermission) return true; // Consume the message but don't process

        const [, command] = message.content.split(' ');
        const channelId = message.channel.id;
        let replyMsg;

        switch (command) {
            case 'off':
                this.cache.disabledSupportChannels.add(channelId);
                replyMsg = await message.reply('Support disabled for this channel.');
                break;
            case 'on':
                this.cache.disabledSupportChannels.delete(channelId);
                replyMsg = await message.reply('Support enabled for this channel.');
                break;
            case 'status':
                const status = this.cache.disabledSupportChannels.has(channelId) ? 'disabled' : 'enabled';
                replyMsg = await message.reply(`Support is **${status}** for this channel.`);
                break;
        }

        if (replyMsg) {
            setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
        }

        return true;
    }

    hasAdminPermission(message) {
        return message.member?.roles.cache.some(role => 
            BotConstants.SUPPORT_COMMAND_ROLES.includes(role.name)
        ) || BotConstants.SUPPORT_COMMAND_USERS.includes(message.author.username);
    }

    async handleMuteCommands(message) {
        const content = message.content.toLowerCase();
        const isMuteCommand = content.includes('shut up') || content.includes('bot quiet');
        
        if (!isMuteCommand) return false;

        const isReplyingToBot = await this.isReplyingToBot(message);
        const isMentioningBot = message.mentions.has(this.client.user.id);

        if (isReplyingToBot || isMentioningBot) {
            this.cache.mutedChannels.set(
                message.channel.id, 
                Date.now() + BotConstants.MUTE_DURATION
            );
            await message.react('🤫');
            return true;
        }

        return false;
    }

    async isReplyingToBot(message) {
        if (!message.reference?.messageId) return false;
        
        try {
            const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
            return repliedTo.author.id === this.client.user.id;
        } catch {
            return false;
        }
    }

    async handleAnswerCommand(message) {
        const answerCommand = /\b(answer (him|her|them))\b/i;
        
        if (!message.reference || 
            !message.mentions.has(this.client.user.id) || 
            !answerCommand.test(message.content)) {
            return null;
        }

        try {
            await message.react('👍');
            return await message.channel.messages.fetch(message.reference.messageId);
        } catch (error) {
            console.error('Error handling answer command:', error);
            return null;
        }
    }

    async processAIResponse(message) {
        // Validate message content
        const userMessage = await this.buildUserMessage(message);
        const imageParts = await this.processImageAttachments(message);

        if (!userMessage && imageParts.length === 0) return;
        if (userMessage.length < 3 && imageParts.length === 0) return;

        // Build context and prompt
        const historyString = await this.buildMessageHistory(message);
        const prompt = this.buildPrompt(message.channel.name, historyString, userMessage);

        try {
            console.log(`Processing AI request for: "${userMessage.substring(0, 100)}..."`);
            
            const aiResponse = await this.aiService.generateResponse(
                prompt, 
                imageParts, 
                message.channel.id
            );

            await this.sendAIResponse(message, aiResponse);

        } catch (error) {
            console.error('AI processing error:', error);
            
            if (error.message === 'Rate limit exceeded') {
                // Silently ignore rate limited requests
                return;
            }
            
            // Log other errors but don't respond to avoid spam
        }
    }

    async buildUserMessage(message) {
        let userMessage = message.content.trim();

        // Add forum title context
        if (message.channel.isThread() && message.channel.parent.type === ChannelType.GuildForum) {
            userMessage = `Title: ${message.channel.name}\nBody: ${userMessage}`;
        }

        // Add embed context
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            const embedContent = `[Embed: ${embed.title || 'No title'} - ${embed.description || 'No description'}]`;
            userMessage = `${userMessage}\n${embedContent}`;
        }

        return userMessage;
    }

    async processImageAttachments(message) {
        const imageParts = [];

        for (const attachment of message.attachments.values()) {
            if (!attachment.contentType?.startsWith('image/')) continue;

            // Skip large assets for inline_data safety
            if (typeof attachment.size === 'number' && attachment.size > BotConstants.ATTACHMENT_MAX_BYTES) {
                console.warn(`Skipping large image (${attachment.size} bytes): ${attachment.name || attachment.url}`);
                continue;
            }

            try {
                const response = await axios.get(attachment.url, { 
                    responseType: 'arraybuffer',
                    timeout: 10000 
                });

                imageParts.push({
                    inline_data: {
                        mime_type: attachment.contentType,
                        data: Buffer.from(response.data).toString('base64')
                    }
                });
            } catch (error) {
                console.error('Error processing image attachment:', error);
            }
        }

        return imageParts;
    }

    async buildMessageHistory(message) {
        try {
            const messages = await message.channel.messages.fetch({ 
                limit: BotConstants.MESSAGE_HISTORY_LIMIT 
            });

            // Build a local index to resolve reply targets without extra fetches
            const ordered = Array.from(messages.values()).reverse();
            const index = new Map(ordered.map(m => [m.id, m]));

            const history = ordered.map(m => {
                let base = `${m.author.username}: ${m.content}`;
                if (m.reference?.messageId) {
                    const repliedTo = index.get(m.reference.messageId);
                    if (repliedTo) {
                        base = `${m.author.username} (replying to ${repliedTo.author.username}): ${m.content}`;
                    }
                }
                if (m.embeds.length > 0) {
                    const embed = m.embeds[0];
                    base += ` [Embed: ${embed.title || ''} - ${embed.description || ''}]`;
                }
                return base;
            });

            return history.join('\n');
        } catch (error) {
            console.error('Error building message history:', error);
            return '';
        }
    }

    buildPrompt(channelName, historyString, userMessage) {
        return `CHAT HISTORY (#${channelName}):
--- START ---
${historyString}
--- END ---

FAQ KNOWLEDGE BASE:
--- START ---
${this.cache.faqString}
--- END ---

USER MESSAGE: "${userMessage}"`;
    }

    async sendAIResponse(message, aiResponse) {
        const ignoreMarker = '[IGNORE]';
        
        if (!aiResponse || aiResponse === ignoreMarker) {
            console.log('AI response ignored');
            return;
        }

        const finalResponse = `${aiResponse}\n-# This is AI generated, may not be accurate`;

        try {
            await message.channel.sendTyping();
            await message.reply({
                content: finalResponse,
                allowedMentions: { repliedUser: false }
            });

            // Mark thread as responded to
            if (message.channel.isThread()) {
                this.cache.respondedThreads.add(message.channel.id);
            }

            console.log('AI response sent successfully');
        } catch (error) {
            console.error('Error sending AI response:', error);
        }
    }
}

// Enhanced main bot class with proper error handling
class PStreamBot {
    constructor() {
        this.config = new Config();
        this.cache = new BotCache();
        this.aiService = new AIService(this.config);
        
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });
        
        this.messageHandler = new MessageHandler(this.client, this.cache, this.aiService);
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, async () => {
            console.log(`Bot ready! Logged in as ${this.client.user.tag}`);
            console.log(`AI features: ${this.config.isAiEnabled() ? 'enabled' : 'disabled'}`);
            await this.cache.loadFaq();
        });

        // Enhanced error handling
        this.client.on(Events.Error, error => {
            console.error('Discord client error:', error);
        });

        this.client.on(Events.Warn, warning => {
            console.warn('Discord client warning:', warning);
        });

        this.client.on(Events.ShardError, error => {
            console.error('Discord shard error:', error);
        });

        // Observe REST rate limits in v14
        this.client.rest.on('rateLimited', (info) => {
            console.warn('Discord REST rate-limited', {
                route: info.route,
                method: info.method,
                limit: info.limit,
                timeout: info.timeToReset,
                global: info.global,
            });
        });

        this.client.on(Events.MessageCreate, async message => {
            try {
                await this.messageHandler.handleMessage(message);
            } catch (error) {
                console.error('Error in message handler:', error);
                // Prevent error spam by not replying to errors
            }
        });

        // Proper shutdown handling
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        
        // Handle uncaught exceptions to prevent crashes
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.shutdown();
        });
        
        process.on('unhandledRejection', (error) => {
            console.error('Unhandled Promise Rejection:', error);
        });
    }

    async start() {
        try {
            await this.client.login(this.config.token);
        } catch (error) {
            console.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        console.log('Shutting down bot...');
        
        // Properly destroy all components
        if (this.cache) {
            this.cache.destroy();
        }
        
        if (this.aiService) {
            this.aiService.destroy();
        }
        
        if (this.client) {
            await this.client.destroy();
        }
        
        process.exit(0);
    }
}

// Start the bot
const bot = new PStreamBot();
bot.start();
