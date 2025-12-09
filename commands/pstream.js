const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pstream')
		.setDescription('Toggle between P-Stream only mode and general AI chatbot mode')
		.addStringOption(option =>
			option
				.setName('mode')
				.setDescription('What mode to use')
				.setRequired(true)
				.addChoices(
					{ name: 'P-Stream Only', value: 'pstream' },
					{ name: 'General AI Chatbot', value: 'general' },
					{ name: 'Check Status', value: 'status' }
				)),
	
	async execute(interaction, { pstreamOnlyChannels }) {
		const mode = interaction.options.getString('mode');
		const channelId = interaction.channel.id;
		
		logger.command(`Pstream toggle command executed: ${mode} by ${interaction.user.username} in channel ${interaction.channel.name}`);
		
		let replyText = '';
		
		if (mode === 'pstream') {
			pstreamOnlyChannels.add(channelId);
			replyText = '✅ Switched to **P-Stream only mode**. I will only respond to P-Stream related questions unless you ping me.';
		} else if (mode === 'general') {
			pstreamOnlyChannels.delete(channelId);
			replyText = '✅ Switched to **General AI Chatbot mode**. I will respond to any questions and conversations.';
		} else if (mode === 'status') {
			const status = pstreamOnlyChannels.has(channelId) ? 'P-Stream only' : 'General AI Chatbot';
			replyText = `Current mode: **${status}**`;
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

