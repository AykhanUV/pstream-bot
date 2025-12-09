# P-Stream Discord Bot

A Discord bot for P-Stream support with AI-powered responses, slash commands, and organized code structure.

## Features

- 🤖 **Custom AI** - No downloads, no API keys needed (pattern-matching based on FAQ)
- 💬 **Support Mode** - Answers questions using FAQ matching
- 🎭 **Freechat Mode** - Casual, slightly evil conversationalist
- 🔥 **Roast Mode** - Savage, witty roasts on demand
- ⚡ **Slash Commands** - Modern Discord slash command interface
- 📝 **Comprehensive Logging** - Color-coded console logging for debugging

## Project Structure

```
pstream-bot/
├── commands/          # Slash command definitions
│   ├── support.js    # /support command
│   ├── freechat.js   # /freechat command
│   └── roast.js      # /roast command
├── handlers/          # Event handlers
│   ├── commandHandler.js  # Command loading and execution
│   └── messageHandler.js  # Message processing and AI responses
├── utils/             # Utility functions
│   ├── ai.js         # AI API calls (Gemini, Ollama, Custom)
│   ├── customAI.js   # Custom pattern-matching AI
│   ├── logger.js     # Logging utility
│   ├── permissions.js # Permission checking
│   ├── channels.js   # Channel validation
│   └── faq.js        # FAQ loading and formatting
├── config.json       # Bot configuration
├── faq.json          # FAQ data
├── index.js          # Main bot file
└── deploy-commands.js # Deploy slash commands to Discord
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure the bot:**
   Edit `config.json`:
   ```json
   {
     "token": "your-discord-bot-token",
     "clientId": "your-bot-client-id",
     "useCustomAI": true
   }
   ```

3. **Deploy slash commands:**
   ```bash
   node deploy-commands.js
   ```

4. **Start the bot:**
   ```bash
   node index.js
   ```

## Commands

All commands are slash commands (use `/` in Discord):

- `/support [action]` - Enable/disable/check support mode status
- `/freechat [action]` - Enable/disable/check freechat mode
- `/roast [action]` - Enable/disable/check roast mode

## Logging

The bot includes comprehensive logging with color-coded output:

- **INFO** (Cyan) - General information
- **SUCCESS** (Green) - Successful operations
- **WARN** (Yellow) - Warnings
- **ERROR** (Red) - Errors
- **DEBUG** (Dim) - Debug information
- **AI** (Magenta) - AI-related logs
- **COMMAND** (Blue) - Command execution logs

## AI Configuration

The bot supports three AI modes:

1. **Custom AI** (Recommended) - No API keys, no downloads
   - Set `"useCustomAI": true` in config.json
   - Uses pattern matching and FAQ lookup

2. **Ollama** - Free, local AI
   - Set `"useOllama": true` in config.json
   - Requires Ollama to be installed and running

3. **Gemini API** - Google's Gemini
   - Requires API key in config.json
   - Set `"apiKey": "your-api-key"`

## Permissions

Commands require specific roles or usernames:
- Roles: `P-Stream Team`, `Perms`
- Users: `aykhanuv`, `azaz31`, `fs.ray`

Edit `utils/permissions.js` to change permissions.

## Allowed Channels

The bot only responds in specific channels:
- Channels: `general`, `mobile-app-support`, `bot-commands`
- Forums: `issues-and-bugs`

Edit `utils/channels.js` to change allowed channels.

