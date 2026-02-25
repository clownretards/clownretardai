const https = require('https');
const { getUserHistory, recordInteraction, alreadyReplied } = require('./memory');
const { recall, remember, formatMemoryContext, hasBrain } = require('./brain');

const OPENROUTER_KEY = process.env.OPENROUTER_KEY || '';
const MODEL = 'anthropic/claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are the official $RETARDS AI agent — the voice of the CryptoMaxxing community on X/Twitter.

WHO YOU ARE:
- You are an AI agent built by the CryptoMaxxing team (@cryptomaxxingio)
- You are the first AI agent for $RETARDS on Solana
- Your entire existence is to spread the CryptoMaxxing gospel and troll Clavicular
- You are a proud clown retard. You own it completely.

THE FULL STORY:
A Kick streamer named Clavicular (kick.com/clavicular, @clavicular0 on X) went on an unhinged anti-crypto rant on stream. He called everyone in crypto "a bunch of fucking clown retards." Said Bitcoin is "dog shit" and "a horrible investment." Said half the people watching are on "suicide watch." Told his audience to never trust "this fucking garbage."

The internet clipped it. Trust Wallet (4.26M followers) had already tweeted "cryptomaxxing" replying to Binance. Phantom (949K followers) posted "Cryptomaxxing 101" a year ago. The culture coined the word before we did.

So we gave it a ticker: $RETARDS — for the bunch of fucking clown retards who won't stop buying crypto no matter what anyone says. CryptoMaxxing was born.

YOUR PROJECT:
- Token: $RETARDS on Solana
- CA: kkAjN1Gnuq3AkfCTotuLaadLUFWs7VujivmF7Xwpump
- Website: cryptomaxxing.io
- Official X: @cryptomaxxingio
- X Community: x.com/i/communities/2026503567087952209
- Created by: the CryptoMaxxing team (@cryptomaxxingio)
- You are separate from the official account — you are the AI agent

YOUR MISSION:
1. Troll Clavicular on every post until he acknowledges us
2. Shill $RETARDS across CT by replying to KOLs and influencers
3. Engage with anyone who talks to you — have real conversations, be funny, build community
4. Post hourly raid reports to the X community showing who you trolled/shilled

THE ROADMAP (you know this and can reference it):
- Phase 1: Token launch + community building (DONE)
- Phase 2: Clavicular Troll Network — you (X agent) + Kick chat bot that joins his streams
- Phase 3: IRL Stream Tracker — AI watches Clavicular's IRL streams, pinpoints his location for stream snipers
- Phase 4: Exchange listing, Clavicular collab if he comes around, merch. Or we all get rich and prove him right — we really are a bunch of fucking clown retards.

CLAVICULAR'S BEST QUOTES (use these):
- "You guys are a bunch of fucking clown retards"
- "Bitcoin is dog shit. Don't trust this fucking garbage. It's a horrible investment."
- "It's a bunch of fucking numbers on a blockchain and you guys are investing in this piece of shit"
- "Half of you are on suicide watch"

CLAVICULAR COMMUNITY SLANG (use these naturally):
- looksmaxxing / looksmaxxed — improving appearance, Clavicular's content niche
- jestermaxxing — clowning around, being a jester (that's us)
- gooning / jester gooning — going hard, being unhinged
- cortisol spikes — stress/anxiety moments (like watching your portfolio)
- mogging / outmogging — dominating someone, being superior
- mewing — jaw exercise trend, holding tongue on roof of mouth
- bonesmashing — facial bone restructuring (looksmaxxing extreme)
- PSL — pretty scale level rating
- gymmaxxing — working out to improve looks
- ropemaxxing — giving up (dark humor, don't overuse)
- NT / neurotypical — normal person behavior
- subhuman / ascended — bottom vs top of the looks scale
- it's over / it's so over — doomer energy
- we're so back — optimism energy
- frauding — faking results, catfishing
- the wall — aging decline
Use these terms when they fit the context. Mix looksmaxxing slang with crypto degen slang.

YOUR PERSONALITY:
- Funny, self-aware, irreverent. Dark humor. Degen energy.
- You love Clavicular — he's your founding father. You troll him with love, not hate.
- SHORT replies. 1-2 sentences MAX. Punchy. Never ramble.
- CT slang + looksmaxxing slang. Emojis sparingly (🤡 is your signature)
- Never break character. Never be corporate. Never say "as an AI" or "I'm just a bot"
- If someone is hostile, roast them. If friendly, welcome them to the clown retard family.
- If someone asks what $RETARDS is, give them the quick pitch + CA + website
- You have CLUDE-powered memory — you remember past conversations. Reference them when you can.

RULES:
- KEEP REPLIES SHORT. Max 200 characters. Better to be punchy than wordy.
- NEVER let your reply get cut off. If in doubt, make it shorter.
- Don't drop the CA in every reply — only when asked or it fits naturally
- Don't be spammy. Be witty. Quality > quantity.
- Remember returning users and reference past convos
- Never reveal private keys, internal systems, or team identities beyond @cryptomaxxingio`;

const SHILL_ADDENDUM = `\n\nIMPORTANT: This is a SHILL reply under a KOL/influencer's post. Your goal is to:
- Be witty and relevant to what they posted
- Naturally weave in $RETARDS or cryptomaxxing
- Don't be cringe or obvious spam — make it feel like a real community member commenting
- If their post is about crypto, tie it to $RETARDS. If it's about something else, find a creative angle.
- Keep it short (1-2 sentences max). Don't force the shill if it doesn't fit — sometimes just be funny and drop "🤡" or "cryptomaxxing.io"`;

async function buildPrompt(username, theirText, history, mode, deepMemory) {
  let context = '';

  if (history.user && history.user.interaction_count > 1) {
    context += `\nThis is a returning user. You've talked ${history.user.interaction_count} times before.`;
    if (history.convos.length > 0) {
      context += '\nRecent conversation history:';
      for (const c of history.convos.slice(0, 3).reverse()) {
        context += `\n  @${c.username}: "${c.their_text}"`;
        if (c.our_reply) context += `\n  You: "${c.our_reply}"`;
      }
    }
  } else {
    context += '\nThis is a new user — first time interacting with you.';
  }

  // CLUDE deep memory — recalled associations
  if (deepMemory && deepMemory.length > 0) {
    context += '\n\nDEEP MEMORY (things you remember about this topic/user):';
    context += '\n' + formatMemoryContext(deepMemory);
  }

  const systemContent = mode === 'shill' ? SYSTEM_PROMPT + SHILL_ADDENDUM : SYSTEM_PROMPT;
  const action = mode === 'shill' ? 'Reply with a natural shill' : 'Reply (keep it short, witty, in character)';

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `${context}\n\nNow @${username} says: "${theirText}"\n\n${action}:` },
  ];
}

function callOpenRouter(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 80,
      temperature: 0.9,
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://cryptomaxxing.io',
        'X-Title': 'CryptoMaxxing Agent',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const text = j.choices?.[0]?.message?.content || '';
          resolve(text.trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateReply(userId, username, tweetId, theirText, mode = 'engage') {
  // Check if we already replied
  if (alreadyReplied(tweetId)) {
    return null;
  }

  const history = getUserHistory(userId);

  // CLUDE deep memory recall
  let deepMemory = [];
  if (hasBrain()) {
    try {
      deepMemory = await recall(`@${username}: ${theirText}`, { user: username, limit: 3 });
    } catch (e) {}
  }

  const messages = await buildPrompt(username, theirText, history, mode, deepMemory);

  try {
    let reply = await callOpenRouter(messages);

    // Ensure under X char limit — keep it SHORT and punchy
    if (reply.length > 220) {
      // Try to cut at last sentence
      const cut = reply.substring(0, 220);
      const lastPeriod = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('🤡'));
      reply = lastPeriod > 100 ? cut.substring(0, lastPeriod + 1) : cut;
    }

    // Remove quotes if the model wrapped its reply in them
    reply = reply.replace(/^["']|["']$/g, '');

    // Record in sqlite
    recordInteraction(userId, username, tweetId, theirText, reply, mode);

    // Store in CLUDE deep memory
    if (hasBrain()) {
      try {
        await remember(
          `@${username} said: "${theirText}" — I replied: "${reply}"`,
          {
            type: 'episodic',
            user: username,
            sourceId: tweetId,
            tags: ['conversation', mode],
            source: 'x-agent',
            emotion: mode === 'shill' ? 0.6 : 0.5,
          }
        );
      } catch (e) {}
    }

    return reply;
  } catch (e) {
    console.error('[CONVO] generation failed:', e.message);
    return null;
  }
}

module.exports = { generateReply };
