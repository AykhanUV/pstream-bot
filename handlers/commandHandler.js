const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadCommands() {
	const commands = new Collection();
	const commandsPath = path.join(__dirname, '..', 'commands');
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		
		if ('data' in command && 'execute' in command) {
			commands.set(command.data.name, command);
			logger.info(`Loaded command: ${command.data.name}`);
		} else {
			logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}

	return commands;
}

module.exports = { loadCommands };

