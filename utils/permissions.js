const config = require('../config.json');

const ALLOWED_ROLE_ID = '1331822505496809484';
const ALLOWED_USERNAMES = ['fs.ray', 'aykhanuv'];

function hasPermission(member) {
	if (!member) return false;
	
	// Check if user has the allowed role ID
	const hasRole = member.roles.cache.has(ALLOWED_ROLE_ID);
	
	// Check if username is in the allowed list
	const hasUser = ALLOWED_USERNAMES.includes(member.user.username);
	
	return hasRole || hasUser;
}

module.exports = { hasPermission, ALLOWED_ROLE_ID, ALLOWED_USERNAMES };

