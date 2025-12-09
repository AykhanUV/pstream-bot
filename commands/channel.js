const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('channel')
		.setDescription('Manage channels and their modes')
		.addSubcommand(subcommand =>
			subcommand
				.setName('add')
				.setDescription('Add a channel with a specific mode')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('The channel to add')
						.setRequired(true))
				.addStringOption(option =>
					option
						.setName('mode')
						.setDescription('The mode for this channel')
						.setRequired(true)
						.addChoices(
							{ name: 'P-Stream Only', value: 'pstream' },
							{ name: 'General AI Chatbot', value: 'general' }
						)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('remove')
				.setDescription('Remove a channel')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('The channel to remove')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('List all managed channels'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('mode')
				.setDescription('Change mode for a channel')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('The channel to update')
						.setRequired(true))
				.addStringOption(option =>
					option
						.setName('mode')
						.setDescription('The new mode')
						.setRequired(true)
						.addChoices(
							{ name: 'P-Stream Only', value: 'pstream' },
							{ name: 'General AI Chatbot', value: 'general' }
						))),
	
	async execute(interaction, { managedChannels, pstreamOnlyChannels }) {
		const subcommand = interaction.options.getSubcommand();
		
		logger.command(`Channel command executed: ${subcommand} by ${interaction.user.username}`);
		
		if (subcommand === 'add') {
			const channel = interaction.options.getChannel('channel');
			const mode = interaction.options.getString('mode');
			
			if (!channel) {
				await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
				return;
			}
			
			managedChannels.set(channel.id, mode);
			if (mode === 'pstream') {
				pstreamOnlyChannels.add(channel.id);
			} else {
				pstreamOnlyChannels.delete(channel.id);
			}
			
			const modeText = mode === 'pstream' ? 'P-Stream only' : 'General AI Chatbot';
			await interaction.reply({ 
				content: `✅ Added ${channel} with mode: **${modeText}**`, 
				ephemeral: true 
			});
			
		} else if (subcommand === 'remove') {
			const channel = interaction.options.getChannel('channel');
			
			if (!channel) {
				await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
				return;
			}
			
			managedChannels.delete(channel.id);
			pstreamOnlyChannels.delete(channel.id);
			
			await interaction.reply({ 
				content: `✅ Removed ${channel} from managed channels`, 
				ephemeral: true 
			});
			
		} else if (subcommand === 'list') {
			if (managedChannels.size === 0) {
				await interaction.reply({ 
					content: 'No managed channels. Use `/channel add` to add channels.', 
					ephemeral: true 
				});
				return;
			}
			
			let list = '**Managed Channels:**\n';
			for (const [channelId, mode] of managedChannels.entries()) {
				const channel = interaction.guild.channels.cache.get(channelId);
				const modeText = mode === 'pstream' ? 'P-Stream only' : 'General AI Chatbot';
				if (channel) {
					list += `${channel} - ${modeText}\n`;
				}
			}
			
			await interaction.reply({ content: list, ephemeral: true });
			
		} else if (subcommand === 'mode') {
			const channel = interaction.options.getChannel('channel');
			const mode = interaction.options.getString('mode');
			
			if (!channel) {
				await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
				return;
			}
			
			if (!managedChannels.has(channel.id)) {
				await interaction.reply({ 
					content: `❌ ${channel} is not a managed channel. Use \`/channel add\` first.`, 
					ephemeral: true 
				});
				return;
			}
			
			managedChannels.set(channel.id, mode);
			if (mode === 'pstream') {
				pstreamOnlyChannels.add(channel.id);
			} else {
				pstreamOnlyChannels.delete(channel.id);
			}
			
			const modeText = mode === 'pstream' ? 'P-Stream only' : 'General AI Chatbot';
			await interaction.reply({ 
				content: `✅ Updated ${channel} to mode: **${modeText}**`, 
				ephemeral: true 
			});
		}
	},
};

