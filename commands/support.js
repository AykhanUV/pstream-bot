const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('support')
		.setDescription('Manage support bot settings for this channel')
		.addStringOption(option =>
			option
				.setName('action')
				.setDescription('What to do with support')
				.setRequired(true)
				.addChoices(
					{ name: 'Enable', value: 'on' },
					{ name: 'Disable', value: 'off' },
					{ name: 'Check Status', value: 'status' }
				)),
	
	async execute(interaction, { disabledSupportChannels }) {
		const action = interaction.options.getString('action');
		const channelId = interaction.channel.id;
		
		logger.command(`Support command executed: ${action} by ${interaction.user.username} in channel ${interaction.channel.name}`);
		
		let replyText = '';
		
		if (action === 'off') {
			disabledSupportChannels.add(channelId);
			replyText = 'Support has been disabled for this channel.';
		} else if (action === 'on') {
			disabledSupportChannels.delete(channelId);
			replyText = 'Support has been enabled for this channel.';
		} else if (action === 'status') {
			const status = disabledSupportChannels.has(channelId) ? 'disabled' : 'enabled';
			replyText = `Support is currently **${status}** for this channel.`;
		}
		
		await interaction.reply({ content: replyText, ephemeral: true });
		
		// Delete the reply after 5 seconds
		setTimeout(async () => {
			try {
				await interaction.deleteReply();
			} catch (error) {
				logger.debug('Could not delete reply (may have already been deleted)');
			}
		}, 5000);
	},
};

