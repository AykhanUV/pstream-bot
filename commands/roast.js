const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('roast')
		.setDescription('Enable/disable roast mode (savage, witty, merciless)')
		.addStringOption(option =>
			option
				.setName('action')
				.setDescription('What to do with roast mode')
				.setRequired(true)
				.addChoices(
					{ name: 'Enable', value: 'on' },
					{ name: 'Disable', value: 'off' },
					{ name: 'Check Status', value: 'status' }
				)),
	
	async execute(interaction, { roastModeChannels, freeChatChannels }) {
		const action = interaction.options.getString('action');
		const channelId = interaction.channel.id;
		
		logger.command(`Roast command executed: ${action} by ${interaction.user.username} in channel ${interaction.channel.name}`);
		
		let replyText = '';
		
		if (action === 'on') {
			roastModeChannels.add(channelId);
			freeChatChannels.delete(channelId); // Disable other modes to avoid conflict
			replyText = 'Roast mode enabled. Prepare to be destroyed.';
		} else if (action === 'off') {
			roastModeChannels.delete(channelId);
			replyText = 'Roast mode disabled. I will be nice(r) now.';
		} else if (action === 'status') {
			const status = roastModeChannels.has(channelId) ? 'enabled' : 'disabled';
			replyText = `Roast mode is currently **${status}** for this channel.`;
		}
		
		await interaction.reply({ content: replyText, ephemeral: true });
		
		setTimeout(async () => {
			try {
				await interaction.deleteReply();
			} catch (error) {
				logger.debug('Could not delete reply (may have already been deleted)');
			}
		}, 5000);
	},
};

