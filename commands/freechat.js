const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('freechat')
		.setDescription('Enable/disable freechat mode (casual, slightly evil conversationalist)')
		.addStringOption(option =>
			option
				.setName('action')
				.setDescription('What to do with freechat mode')
				.setRequired(true)
				.addChoices(
					{ name: 'Enable', value: 'on' },
					{ name: 'Disable', value: 'off' },
					{ name: 'Check Status', value: 'status' }
				)),
	
	async execute(interaction, { freeChatChannels, roastModeChannels }) {
		const action = interaction.options.getString('action');
		const channelId = interaction.channel.id;
		
		logger.command(`Freechat command executed: ${action} by ${interaction.user.username} in channel ${interaction.channel.name}`);
		
		let replyText = '';
		
		if (action === 'on') {
			freeChatChannels.add(channelId);
			roastModeChannels.delete(channelId); // Disable other modes to avoid conflict
			replyText = 'Freechat mode enabled. I am now a casual, slightly evil conversationalist.';
		} else if (action === 'off') {
			freeChatChannels.delete(channelId);
			replyText = 'Freechat mode disabled. Back to support duties.';
		} else if (action === 'status') {
			const status = freeChatChannels.has(channelId) ? 'enabled' : 'disabled';
			replyText = `Freechat mode is currently **${status}** for this channel.`;
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

