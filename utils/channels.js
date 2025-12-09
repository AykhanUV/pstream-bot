const allowedChannels = ['general', 'mobile-app-support', 'bot-commands'];
const allowedForums = ['issues-and-bugs'];
const allowedChannelIds = ['1447742492228325477']; // AI chat channel

function isAllowedChannel(channel) {
	// Check by channel ID first
	if (allowedChannelIds.includes(channel.id)) {
		return true;
	}
	
	const channelName = channel.name;
	const parentChannelName = channel.isThread() ? channel.parent?.name : null;
	const isAllowedChannel = allowedChannels.includes(channelName);
	const isAllowedForum = allowedForums.includes(parentChannelName);
	
	return isAllowedChannel || isAllowedForum;
}

function isAIChatChannel(channel) {
	return allowedChannelIds.includes(channel.id);
}

module.exports = { isAllowedChannel, isAIChatChannel, allowedChannels, allowedForums, allowedChannelIds };

