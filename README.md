# CryptoMaxxing X Agent 🤡

Auto-replies to @clavicular0 tweets with $RETARDS quotes from his own anti-crypto rant.

## Setup
1. Copy `.env.example` to `.env`
2. Fill in X API credentials
3. `npm install`
4. `node agent.js` (or use pm2)

## How it works
- Polls @clavicular0 timeline every 2 minutes
- Replies to every new tweet with a rotated quote from his rant
- Random delay (10-45s) before each reply to look human
- Never repeats the same quote until all quotes used
- State persists across restarts (state.json)
