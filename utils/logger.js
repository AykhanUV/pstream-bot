const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
};

function getTimestamp() {
	return new Date().toISOString();
}

function formatMessage(level, message, color) {
	const timestamp = getTimestamp();
	return `${color}${colors.bright}[${timestamp}]${colors.reset} ${color}[${level}]${colors.reset} ${message}`;
}

const logger = {
	info: (message) => {
		console.log(formatMessage('INFO', message, colors.cyan));
	},
	
	success: (message) => {
		console.log(formatMessage('SUCCESS', message, colors.green));
	},
	
	warn: (message) => {
		console.warn(formatMessage('WARN', message, colors.yellow));
	},
	
	error: (message, error = null) => {
		console.error(formatMessage('ERROR', message, colors.red));
		if (error) {
			console.error(`${colors.red}${error.stack || error}${colors.reset}`);
		}
	},
	
	debug: (message) => {
		console.log(formatMessage('DEBUG', message, colors.dim));
	},
	
	ai: (message) => {
		console.log(formatMessage('AI', message, colors.magenta));
	},
	
	command: (message) => {
		console.log(formatMessage('COMMAND', message, colors.blue));
	},
};

module.exports = logger;

