/**
 * Domain-specific synonym map for query expansion.
 *
 * Design principles:
 * - Only include high-confidence synonyms
 * - Avoid generic terms that add noise
 * - Focus on domain-specific terminology
 */
export const SYNONYMS = {
  // Configuration
  'config': ['configuration', 'setup', 'settings'],
  'configuration': ['config', 'setup'],
  'settings': ['config', 'configuration'],

  // Agent/Bot
  'agent': ['bot', 'assistant'],
  'bot': ['agent', 'assistant'],
  'assistant': ['agent', 'bot'],

  // Channels
  'telegram': ['tg'],
  'tg': ['telegram'],
  'discord': ['channel:discord'],
  'whatsapp': ['channel:whatsapp'],

  // TTS
  'tts': ['text-to-speech', 'voice', 'speech'],
  'text-to-speech': ['tts', 'voice'],
  'voice': ['tts', 'text-to-speech'],

  // Skills/Tools
  'skill': ['tool', 'SKILL.md'],
  'tool': ['skill', 'capability'],

  // Sandbox
  'sandbox': ['container', 'docker', 'isolated'],
  'container': ['sandbox', 'docker'],
  'docker': ['container', 'sandbox'],

  // Memory/Storage
  'memory': ['storage', 'persistence', 'database'],
  'storage': ['memory', 'persistence'],

  // Session
  'session': ['conversation', 'chat', 'thread'],
  'conversation': ['session', 'chat'],

  // Gateway
  'gateway': ['server', 'rpc', 'api'],
  'server': ['gateway', 'rpc'],

  // Workspace
  'workspace': ['agent-dir', 'workspaceRoot'],

  // Hooks/Automation
  'hook': ['webhook', 'trigger', 'automation'],
  'webhook': ['hook', 'trigger'],
  'automation': ['hook', 'workflow'],
};

/**
 * Expand query with synonyms for better recall.
 * @param {string} query - Original query
 * @returns {string} - Expanded query with synonyms
 */
export function expandQuery(query) {
  const words = query.toLowerCase().split(/\s+/);
  const expansions = new Set([query]); // Always include original

  for (const word of words) {
    // Remove punctuation for matching
    const cleanWord = word.replace(/[^\w-]/g, '');

    if (SYNONYMS[cleanWord]) {
      // Add synonyms
      for (const syn of SYNONYMS[cleanWord]) {
        expansions.add(syn);
      }
    }
  }

  // Join all expansions
  return Array.from(expansions).join(' ');
}
