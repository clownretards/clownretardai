require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
const { CLAVICULAR_QUOTES, QuoteRotator } = require('./quotes');
const { generateReply } = require('./conversation');
const { alreadyReplied, recordInteraction } = require('./memory');
const { initBrain, remember, startDreamSchedule, hasBrain } = require('./brain');

// ─── CONFIG ───
const TARGET_USER = process.env.TARGET_USER || 'clavicular0';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 120000; // 2 min
const MENTION_POLL_INTERVAL = parseInt(process.env.MENTION_POLL_INTERVAL) || 90000; // 1.5 min
const FEED_POLL_INTERVAL = parseInt(process.env.FEED_POLL_INTERVAL) || 180000; // 3 min
const MAX_FEED_REPLIES_PER_CYCLE = 3; // don't spam — max 3 replies per feed check
const MIN_REPLY_DELAY = parseInt(process.env.MIN_REPLY_DELAY) || 10000;
const MAX_REPLY_DELAY = parseInt(process.env.MAX_REPLY_DELAY) || 45000;
const CA = process.env.CA || 'kkAjN1Gnuq3AkfCTotuLaadLUFWs7VujivmF7Xwpump';
const STATE_FILE = path.join(__dirname, 'state.json');

// ─── STATE ───
const COMMUNITY_ID = process.env.X_COMMUNITY_ID || ''; // CryptoMaxxing X community
const COMMUNITY_POST_INTERVAL = parseInt(process.env.COMMUNITY_POST_INTERVAL) || 3600000; // 1 hour

let state = { lastTweetId: null, lastMentionId: null, lastFeedTweetId: null, repliedTo: [], raidLog: [], startedAt: Date.now() };

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) };
      console.log(`[STATE] loaded. last tweet: ${state.lastTweetId}, last mention: ${state.lastMentionId}`);
    }
  } catch (e) {
    console.error('[STATE] failed to load:', e.message);
  }
}

function saveState() {
  try {
    if (state.repliedTo.length > 500) state.repliedTo = state.repliedTo.slice(-500);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[STATE] failed to save:', e.message);
  }
}

// ─── X CLIENT ───
const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const rwClient = client.readWrite;
const quoter = new QuoteRotator(CLAVICULAR_QUOTES);

// ─── HELPERS ───
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() { return MIN_REPLY_DELAY + Math.floor(Math.random() * (MAX_REPLY_DELAY - MIN_REPLY_DELAY)); }

// ─── CLAVICULAR TRACKING ───
let targetUserId = null;
let myUserId = null;
let myUsername = null;

async function getTargetUserId() {
  if (targetUserId) return targetUserId;
  try {
    const user = await rwClient.v2.userByUsername(TARGET_USER);
    targetUserId = user.data.id;
    console.log(`[TARGET] @${TARGET_USER} → ID: ${targetUserId}`);
    return targetUserId;
  } catch (e) {
    console.error(`[TARGET] failed to get user ID:`, e.message);
    return null;
  }
}

async function fetchNewTweets() {
  const userId = await getTargetUserId();
  if (!userId) return [];

  try {
    const params = {
      max_results: 5,
      'tweet.fields': ['created_at', 'text'],
      exclude: ['retweets'],
    };
    if (state.lastTweetId) params.since_id = state.lastTweetId;

    const timeline = await rwClient.v2.userTimeline(userId, params);
    const tweets = timeline.data?.data || [];
    if (tweets.length > 0) console.log(`[CLAV] found ${tweets.length} new tweet(s)`);
    return tweets;
  } catch (e) {
    console.error('[CLAV] fetch error:', e.message);
    if (e.code === 429) await sleep(300000);
    return [];
  }
}

async function replyToClav(tweetId) {
  if (state.repliedTo.includes(tweetId) || alreadyReplied(tweetId)) return false;

  const delay = randomDelay();
  console.log(`[CLAV] replying to ${tweetId} in ${(delay/1000).toFixed(0)}s...`);
  await sleep(delay);

  const quote = quoter.next();
  try {
    await rwClient.v2.reply(quote, tweetId);
    console.log(`[CLAV] ✅ replied: "${quote.substring(0, 60)}..."`);
    state.repliedTo.push(tweetId);
    state.raidLog.push({ type: 'clav', user: TARGET_USER, time: Date.now() });
    // Record in sqlite for persistent dedup across restarts
    recordInteraction('clav', TARGET_USER, tweetId, '[clavicular tweet]', quote, 'troll');
    if (hasBrain()) {
      remember(`Trolled @${TARGET_USER} with: "${quote}"`, {
        type: 'episodic', user: TARGET_USER, sourceId: tweetId,
        tags: ['troll', 'clavicular'], source: 'x-agent', emotion: 0.8,
      }).catch(() => {});
    }
    saveState();
    return true;
  } catch (e) {
    console.error(`[CLAV] ❌ reply failed:`, e.message);
    if (e.code === 429) await sleep(900000);
    return false;
  }
}

// ─── MENTION / CONVERSATION TRACKING ───
async function fetchMentions() {
  if (!myUserId) return [];

  try {
    const params = {
      max_results: 10,
      'tweet.fields': ['created_at', 'text', 'author_id', 'in_reply_to_user_id', 'conversation_id'],
      'expansions': ['author_id'],
      'user.fields': ['username'],
    };
    if (state.lastMentionId) params.since_id = state.lastMentionId;

    const mentions = await rwClient.v2.userMentionTimeline(myUserId, params);
    const tweets = mentions.data?.data || [];
    const users = {};

    // Build user lookup from includes
    for (const u of (mentions.includes?.users || [])) {
      users[u.id] = u.username;
    }

    if (tweets.length > 0) console.log(`[MENTIONS] found ${tweets.length} new mention(s)`);

    return tweets.map(t => ({
      ...t,
      username: users[t.author_id] || 'unknown',
    }));
  } catch (e) {
    console.error('[MENTIONS] fetch error:', e.message);
    if (e.code === 429) await sleep(300000);
    return [];
  }
}

async function handleMentions() {
  const mentions = await fetchMentions();
  if (mentions.length === 0) return;

  const sorted = mentions.sort((a, b) => a.id.localeCompare(b.id));

  for (const mention of sorted) {
    // Skip our own tweets
    if (mention.author_id === myUserId) {
      if (!state.lastMentionId || mention.id > state.lastMentionId) {
        state.lastMentionId = mention.id;
        saveState();
      }
      continue;
    }

    // Skip if already replied
    if (alreadyReplied(mention.id)) {
      if (!state.lastMentionId || mention.id > state.lastMentionId) {
        state.lastMentionId = mention.id;
        saveState();
      }
      continue;
    }

    console.log(`[MENTION] @${mention.username}: "${mention.text.substring(0, 80)}"`);

    // Generate contextual reply
    const reply = await generateReply(mention.author_id, mention.username, mention.id, mention.text);

    if (reply) {
      const delay = randomDelay();
      console.log(`[MENTION] replying in ${(delay/1000).toFixed(0)}s...`);
      await sleep(delay);

      try {
        await rwClient.v2.reply(reply, mention.id);
        console.log(`[MENTION] ✅ @${mention.username}: "${reply.substring(0, 60)}..."`);
        state.raidLog.push({ type: 'convo', user: mention.username, time: Date.now() });
      } catch (e) {
        console.error(`[MENTION] ❌ reply failed:`, e.message);
        if (e.code === 429) await sleep(900000);
      }
    }

    // Update last mention ID
    if (!state.lastMentionId || mention.id > state.lastMentionId) {
      state.lastMentionId = mention.id;
      saveState();
    }
  }
}

// ─── FEED SHILL (replies to followed accounts' tweets) ───
async function fetchFeedTweets() {
  if (!myUserId) return [];

  try {
    const params = {
      max_results: 10,
      'tweet.fields': ['created_at', 'text', 'author_id'],
      'expansions': ['author_id'],
      'user.fields': ['username'],
      exclude: ['retweets', 'replies'],
    };
    if (state.lastFeedTweetId) params.since_id = state.lastFeedTweetId;

    const timeline = await rwClient.v2.homeTimeline(params);
    const tweets = timeline.data?.data || [];
    const users = {};

    for (const u of (timeline.includes?.users || [])) {
      users[u.id] = u.username;
    }

    return tweets
      .filter(t => t.author_id !== myUserId) // skip own tweets
      .filter(t => t.author_id !== targetUserId) // skip clavicular (handled separately)
      .map(t => ({ ...t, username: users[t.author_id] || 'unknown' }));
  } catch (e) {
    console.error('[FEED] fetch error:', e.message);
    if (e.code === 429) await sleep(300000);
    return [];
  }
}

async function pollFeed() {
  console.log('[POLL] checking feed for shill opportunities...');

  const tweets = await fetchFeedTweets();
  if (tweets.length === 0) {
    console.log('[FEED] no new tweets from followed accounts');
    return;
  }

  const sorted = tweets.sort((a, b) => a.id.localeCompare(b.id));
  let repliedCount = 0;

  for (const tweet of sorted) {
    // Update cursor regardless
    if (!state.lastFeedTweetId || tweet.id > state.lastFeedTweetId) {
      state.lastFeedTweetId = tweet.id;
      saveState();
    }

    // Max replies per cycle
    if (repliedCount >= MAX_FEED_REPLIES_PER_CYCLE) break;

    // Double dedup: check both sqlite AND state
    if (alreadyReplied(tweet.id) || state.repliedTo.includes(tweet.id)) continue;

    console.log(`[FEED] @${tweet.username}: "${tweet.text.substring(0, 80)}"`);

    // Generate a shill-flavored reply
    const reply = await generateReply(tweet.author_id, tweet.username, tweet.id, tweet.text, 'shill');

    if (reply) {
      const delay = randomDelay();
      console.log(`[FEED] replying to @${tweet.username} in ${(delay/1000).toFixed(0)}s...`);
      await sleep(delay);

      try {
        await rwClient.v2.reply(reply, tweet.id);
        console.log(`[FEED] ✅ @${tweet.username}: "${reply.substring(0, 60)}..."`);
        state.repliedTo.push(tweet.id);
        state.raidLog.push({ type: 'shill', user: tweet.username, time: Date.now() });
        recordInteraction(tweet.author_id, tweet.username, tweet.id, tweet.text, reply, 'shill');
        saveState();
        repliedCount++;
      } catch (e) {
        console.error(`[FEED] ❌ reply failed:`, e.message);
        if (e.code === 429) {
          console.log('[FEED] rate limited, stopping feed replies this cycle');
          await sleep(900000);
          break;
        }
      }
    }
  }

  if (repliedCount > 0) console.log(`[FEED] replied to ${repliedCount} tweets this cycle`);
}

// ─── HOURLY COMMUNITY RECAP ───
async function postCommunityRecap() {
  if (!COMMUNITY_ID) {
    console.log('[COMMUNITY] no community ID set, skipping recap');
    return;
  }

  const oneHourAgo = Date.now() - 3600000;
  const recentRaids = state.raidLog.filter(r => r.time > oneHourAgo);

  if (recentRaids.length === 0) {
    console.log('[COMMUNITY] no raids this hour, skipping recap');
    return;
  }

  // Tally up
  const clavReplies = recentRaids.filter(r => r.type === 'clav').length;
  const shillReplies = recentRaids.filter(r => r.type === 'shill');
  const convoReplies = recentRaids.filter(r => r.type === 'convo');

  const shilledUsers = [...new Set(shillReplies.map(r => r.user))];
  const convoUsers = [...new Set(convoReplies.map(r => r.user))];

  let recap = `🤡 HOURLY RAID REPORT\n\n`;
  recap += `raids this hour: ${recentRaids.length}\n\n`;

  if (clavReplies > 0) {
    recap += `🎯 trolled @${TARGET_USER}: ${clavReplies}x\n`;
  }

  if (shilledUsers.length > 0) {
    recap += `\n💊 shilled under:\n`;
    for (const user of shilledUsers.slice(0, 10)) {
      recap += `→ @${user}\n`;
    }
  }

  if (convoUsers.length > 0) {
    recap += `\n💬 had conversations with:\n`;
    for (const user of convoUsers.slice(0, 10)) {
      recap += `→ @${user}\n`;
    }
  }

  recap += `\nthe clown retards never sleep 🤡\n$RETARDS | cryptomaxxing.io`;

  try {
    // Post to X community using community tweet
    await rwClient.v2.tweet({
      text: recap,
      community_id: COMMUNITY_ID,
    });
    console.log(`[COMMUNITY] ✅ posted hourly recap (${recentRaids.length} raids)`);

    // Clear old raid logs (keep only last 2 hours for overlap)
    const twoHoursAgo = Date.now() - 7200000;
    state.raidLog = state.raidLog.filter(r => r.time > twoHoursAgo);
    saveState();
  } catch (e) {
    console.error('[COMMUNITY] ❌ recap post failed:', e.message);
    // Try as regular tweet if community post fails
    if (e.message?.includes('community')) {
      try {
        await rwClient.v2.tweet(recap);
        console.log('[COMMUNITY] posted as regular tweet instead');
      } catch (e2) {
        console.error('[COMMUNITY] regular tweet also failed:', e2.message);
      }
    }
  }
}

// ─── POLL LOOPS ───
async function pollClavicular() {
  console.log(`[POLL] checking @${TARGET_USER}...`);
  const tweets = await fetchNewTweets();
  if (tweets.length === 0) return;

  const sorted = tweets.sort((a, b) => a.id.localeCompare(b.id));
  for (const tweet of sorted) {
    console.log(`[CLAV] ${tweet.id}: "${tweet.text.substring(0, 80)}"`);
    await replyToClav(tweet.id);
    if (!state.lastTweetId || tweet.id > state.lastTweetId) {
      state.lastTweetId = tweet.id;
      saveState();
    }
  }
}

async function pollMentions() {
  console.log('[POLL] checking mentions...');
  await handleMentions();
}

// ─── START ───
async function start() {
  console.log('=== CRYPTOMAXXING X AGENT ===');
  console.log(`Target: @${TARGET_USER}`);
  console.log(`Clav poll: ${POLL_INTERVAL / 1000}s | Mention poll: ${MENTION_POLL_INTERVAL / 1000}s`);
  console.log(`CA: ${CA}`);
  console.log('');

  loadState();

  // Init CLUDE brain
  await initBrain();
  if (hasBrain()) {
    startDreamSchedule();
    console.log('[BRAIN] CLUDE memory active — agent remembers everything 🧠');
  }

  // Verify credentials
  try {
    const me = await rwClient.v2.me();
    myUserId = me.data.id;
    myUsername = me.data.username;
    console.log(`[AUTH] ✅ logged in as @${myUsername} (${myUserId})`);
  } catch (e) {
    console.error('[AUTH] ❌ failed:', e.message);
    process.exit(1);
  }

  // Initial polls
  await pollClavicular();
  await pollMentions();
  await pollFeed();

  // Staggered loops
  setInterval(pollClavicular, POLL_INTERVAL);
  setInterval(pollMentions, MENTION_POLL_INTERVAL);
  setTimeout(() => setInterval(pollFeed, FEED_POLL_INTERVAL), 60000); // offset by 1 min
  setInterval(postCommunityRecap, COMMUNITY_POST_INTERVAL); // hourly recap

  console.log(`[LIVE] agent is running. trolling @${TARGET_USER} + shilling feed + engaging community. 🤡`);
  console.log(`[LIVE] community recap every ${COMMUNITY_POST_INTERVAL / 60000} min${COMMUNITY_ID ? ' → community ' + COMMUNITY_ID : ' (no community ID set)'}`);

}

start().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
