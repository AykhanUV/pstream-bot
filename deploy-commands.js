const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.json');
const logger = require('./utils/logger');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
		logger.info(`Prepared command: ${command.data.name}`);
	} else {
		logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

const rest = new REST().setToken(config.token);

(async () => {
	try {
		logger.info(`Started refreshing ${commands.length} application (/) commands.`);

		if (!config.clientId) {
			throw new Error('clientId is missing in config.json. Please add it.');
		}

		const data = await rest.put(
			Routes.applicationCommands(config.clientId),
			{ body: commands },
		);

		logger.success(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		logger.error('Error deploying commands:', error);
	}
})();
