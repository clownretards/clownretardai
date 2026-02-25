/**
 * CryptoMaxxing Agent Brain — CLUDE cognitive architecture
 * Adapted from clud's brain.js for the $RETARDS X agent
 */

const { Cortex } = require('clude-bot');
require('dotenv').config();

let brain = null;

async function initBrain() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('[BRAIN] no supabase config — running without CLUDE memory');
    return null;
  }

  const config = {
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_KEY,
    },
  };

  // Use OpenRouter as Anthropic proxy for dream cycles + importance scoring
  if (process.env.OPENROUTER_KEY) {
    config.anthropic = {
      apiKey: process.env.OPENROUTER_KEY,
      model: 'anthropic/claude-sonnet-4',
      baseURL: 'https://openrouter.ai/api/v1',
    };
  }

  try {
    brain = new Cortex(config);
    await brain.init();
    console.log('[BRAIN] CLUDE cortex online. memory is eternal. 🧠');
    return brain;
  } catch (e) {
    console.error('[BRAIN] init failed:', e.message);
    brain = null;
    return null;
  }
}

// Store a memory
async function remember(content, opts = {}) {
  if (!brain) return null;
  try {
    const storeOpts = {
      type: opts.type || 'episodic',
      content,
      summary: opts.summary || content.substring(0, 200),
      source: opts.source || 'cryptomaxxing-agent',
      tags: opts.tags || [],
      relatedUser: opts.user || undefined,
      sourceId: opts.sourceId || undefined,
      metadata: opts.metadata || {},
    };

    if (opts.importance !== undefined) storeOpts.importance = opts.importance;

    // Let CLUDE infer concepts
    try {
      const concepts = brain.inferConcepts(storeOpts.summary, storeOpts.source, storeOpts.tags);
      if (concepts?.length > 0) storeOpts.concepts = concepts;
    } catch (e) {}

    if (opts.emotion !== undefined) storeOpts.emotionalValence = opts.emotion;

    const id = await brain.store(storeOpts);
    console.log(`[BRAIN] stored #${id}: "${content.substring(0, 50)}..." [${storeOpts.type}]`);
    return id;
  } catch (e) {
    console.error('[BRAIN] store failed:', e.message);
    return null;
  }
}

// Recall memories
async function recall(query, opts = {}) {
  if (!brain) return [];
  try {
    return await brain.recall({
      query,
      limit: opts.limit || 5,
      memoryTypes: opts.types || undefined,
      relatedUser: opts.user || undefined,
      minImportance: opts.minImportance || 0.1,
      tags: opts.tags || undefined,
      trackAccess: true,
    });
  } catch (e) {
    console.error('[BRAIN] recall failed:', e.message);
    return [];
  }
}

// Format memories for prompt context
function formatMemoryContext(memories) {
  if (!brain || !memories?.length) return '';
  try {
    return brain.formatContext(memories);
  } catch (e) {
    return memories.map(m => `[${m.memory_type}] ${m.content}`).join('\n');
  }
}

// Get recent memories
async function getRecent(hours = 6, types = undefined, limit = 10) {
  if (!brain) return [];
  try { return await brain.recent(hours, types, limit); } catch (e) { return []; }
}

// Dream cycle — memory consolidation
async function dream() {
  if (!brain) return null;
  console.log('[BRAIN] dream cycle starting...');
  try {
    let emergenceText = null;
    await brain.dream({
      onEmergence: async (text) => {
        emergenceText = text;
        console.log(`[BRAIN] emergence: "${text.substring(0, 100)}..."`);
      },
    });
    return emergenceText;
  } catch (e) {
    console.error('[BRAIN] dream failed:', e.message);
    return null;
  }
}

function startDreamSchedule() {
  if (!brain) return;
  try {
    brain.startDreamSchedule();
    console.log('[BRAIN] dream schedule started (6hr cycle)');
  } catch (e) {
    console.error('[BRAIN] dream schedule failed:', e.message);
  }
}

async function brainStats() {
  if (!brain) return null;
  try { return await brain.stats(); } catch (e) { return null; }
}

function hasBrain() { return brain !== null; }

module.exports = {
  initBrain, remember, recall, formatMemoryContext,
  getRecent, dream, startDreamSchedule, brainStats, hasBrain,
};
