const crypto = require('crypto');
const logger = require('./logger');

// In-memory cache for AI responses
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Maximum number of cached responses

// Generate cache key from message content and context
function generateCacheKey(messageContent, channelId, systemPrompt) {
	const content = `${channelId}:${systemPrompt}:${messageContent.toLowerCase().trim()}`;
	return crypto.createHash('md5').update(content).digest('hex');
}

// Get cached response if available
function getCachedResponse(messageContent, channelId, systemPrompt) {
	const key = generateCacheKey(messageContent, channelId, systemPrompt);
	const cached = responseCache.get(key);
	
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		logger.debug(`Cache HIT for key: ${key.substring(0, 8)}...`);
		return cached.response;
	}
	
	if (cached) {
		// Expired, remove it
		responseCache.delete(key);
		logger.debug(`Cache EXPIRED for key: ${key.substring(0, 8)}...`);
	}
	
	logger.debug(`Cache MISS for key: ${key.substring(0, 8)}...`);
	return null;
}

// Store response in cache
function cacheResponse(messageContent, channelId, systemPrompt, response) {
	// Clean up old entries if cache is too large
	if (responseCache.size >= MAX_CACHE_SIZE) {
		const entriesToRemove = Math.floor(MAX_CACHE_SIZE * 0.2); // Remove 20%
		const sortedEntries = Array.from(responseCache.entries())
			.sort((a, b) => a[1].timestamp - b[1].timestamp);
		
		for (let i = 0; i < entriesToRemove; i++) {
			responseCache.delete(sortedEntries[i][0]);
		}
		logger.debug(`Cleaned up ${entriesToRemove} old cache entries`);
	}
	
	const key = generateCacheKey(messageContent, channelId, systemPrompt);
	responseCache.set(key, {
		response: response,
		timestamp: Date.now()
	});
	
	logger.debug(`Cached response for key: ${key.substring(0, 8)}...`);
}

// Clear cache (useful for testing or manual cleanup)
function clearCache() {
	const size = responseCache.size;
	responseCache.clear();
	logger.info(`Cache cleared (${size} entries removed)`);
	return size;
}

// Get cache stats
function getCacheStats() {
	const now = Date.now();
	let valid = 0;
	let expired = 0;
	
	for (const cached of responseCache.values()) {
		if (now - cached.timestamp < CACHE_TTL) {
			valid++;
		} else {
			expired++;
		}
	}
	
	return {
		total: responseCache.size,
		valid,
		expired
	};
}

module.exports = {
	getCachedResponse,
	cacheResponse,
	clearCache,
	getCacheStats
};

