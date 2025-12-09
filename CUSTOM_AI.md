# Custom AI - No Downloads, No API Keys!

Your bot now has a built-in custom AI that requires **zero downloads** and **no API keys**. It's completely self-contained!

## How It Works

The custom AI uses:
- **Pattern matching** - Recognizes common questions and keywords
- **FAQ lookup** - Matches user questions to your FAQ entries
- **Smart responses** - Handles different modes (support, freechat, roast)

## Setup

Just add this to your `config.json`:

```json
{
  "token": "your-discord-token",
  "clientId": "your-client-id",
  "useCustomAI": true
}
```

That's it! No API keys, no downloads, no external services needed.

## Features

✅ **Support Mode** - Answers questions using your FAQ  
✅ **Freechat Mode** - Casual, slightly evil conversationalist  
✅ **Roast Mode** - Generates roasts on demand  
✅ **Smart Ignoring** - Knows when not to respond  
✅ **Context Aware** - Understands conversation flow  

## How It Matches Questions

The AI looks for:
- Keywords in your FAQ entries
- Common patterns (audio issues, video problems, etc.)
- Special cases (safety questions, video/audio issues)
- Context from chat history

If it finds a good match (score ≥ 3), it responds with the FAQ answer. Otherwise, it ignores the message.

## Customization

You can improve the AI by:
1. Adding more FAQ entries to `faq.json`
2. Adjusting the scoring thresholds in the code
3. Adding more pattern matches for common questions

Enjoy your completely free, self-contained AI bot! 🎉

