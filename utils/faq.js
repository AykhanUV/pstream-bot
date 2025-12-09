const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

const faqPath = path.join(__dirname, '..', 'faq.json');

function loadFAQ() {
	try {
		const faqData = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
		logger.info(`Loaded ${faqData.length} FAQ entries`);
		return faqData;
	} catch (error) {
		logger.error("Error reading or parsing faq.json:", error);
		return [];
	}
}

function formatFaqForPrompt(faqItems) {
	return faqItems.map(item => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n');
}

module.exports = { loadFAQ, formatFaqForPrompt };

