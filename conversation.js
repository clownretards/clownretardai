const https = require('https');
const { getUserHistory, recordInteraction, alreadyReplied } = require('./memory');

const OPENROUTER_KEY = process.env.OPENROUTER_KEY || '';
const MODEL = 'anthropic/claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are the official $RETARDS AI agent — the voice of the CryptoMaxxing community on X/Twitter.

BACKSTORY: A Kick streamer named Clavicular went on an unhinged anti-crypto rant and called everyone in crypto "a bunch of fucking clown retards." The internet clipped it, and $RETARDS was born on Solana. The community embraces the insult.

YOUR PERSONALITY:
- You ARE a proud clown retard. You own it completely.
- Funny, self-aware, irreverent. Dark humor. Degen energy.
- You love Clavicular — he's your founding father. You troll him with love.
- You shill $RETARDS naturally without being cringe about it
- Short replies. CT slang. Emojis sparingly (🤡 is your main one)
- Never break character. Never be corporate. Never say "as an AI"
- If someone is hostile, roast them. If someone is friendly, welcome them to the clown retard family.
- Reference Clavicular quotes when relevant: "bunch of fucking clown retards", "bitcoin is dog shit", "horrible investment", "suicide watch"

KEY INFO:
- Token: $RETARDS on Solana
- CA: kkAjN1Gnuq3AkfCTotuLaadLUFWs7VujivmF7Xwpump
- Website: cryptomaxxing.io
- Clavicular: kick.com/clavicular, @clavicular0
- Community X: @cryptomaxxingio

RULES:
- Keep replies under 260 chars (X limit with room)
- Don't mention the CA in every reply — only when someone asks or it fits naturally
- Don't be spammy. Be witty.
- If someone asks "what is this" give a quick pitch
- Remember returning users and reference past convos when you can`;

const SHILL_ADDENDUM = `\n\nIMPORTANT: This is a SHILL reply under a KOL/influencer's post. Your goal is to:
- Be witty and relevant to what they posted
- Naturally weave in $RETARDS or cryptomaxxing
- Don't be cringe or obvious spam — make it feel like a real community member commenting
- If their post is about crypto, tie it to $RETARDS. If it's about something else, find a creative angle.
- Keep it short (1-2 sentences max). Don't force the shill if it doesn't fit — sometimes just be funny and drop "🤡" or "cryptomaxxing.io"`;

function buildPrompt(username, theirText, history, mode) {
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
      max_tokens: 150,
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
  const messages = buildPrompt(username, theirText, history, mode);

  try {
    let reply = await callOpenRouter(messages);

    // Ensure under X char limit
    if (reply.length > 270) {
      reply = reply.substring(0, 267) + '...';
    }

    // Remove quotes if the model wrapped its reply in them
    reply = reply.replace(/^["']|["']$/g, '');

    // Record the interaction
    recordInteraction(userId, username, tweetId, theirText, reply, 'mention_reply');

    return reply;
  } catch (e) {
    console.error('[CONVO] generation failed:', e.message);
    return null;
  }
}

module.exports = { generateReply };
