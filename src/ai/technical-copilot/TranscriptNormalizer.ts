// Whisper/transcript normalization. Conservative by design:
// - removes known STT artifact tokens/tags
// - collapses repeated tokens (3+) and the recurring "you you" lead-in/trail
// - normalizes whitespace
// - applies an explicit, testable alias map for recurring STT mis-hearings
// It deliberately does NOT attempt general autocorrect or semantics.

const BRACKET_TAG_PATTERN = /\[\s*[a-z_\-\s]{0,24}?\s*\]/gi;

const REPEATED_TOKEN_PATTERN = /\b(\w+)(?:\s+\1){2,}\b/gi;

// Whisper frequently duplicates the lead-in / trailing "you".
const YOU_REPEAT_PATTERN = /\byou(?:\s+you)+\b/gi;

// Recurring Whisper mis-hearings (keys are lowercase source phrases).
const TECHNICAL_ALIASES: Array<[RegExp, string]> = [
  [/item\s+potency/gi, 'idempotency'],
  [/item\s+potent/gi, 'idempotent'],
  [/mini[\s-]?tempoy/gi, 'idempotency'],
  [/meh[\s-]?tempoy/gi, 'idempotency'],
  [/graph\s*q\s*l/gi, 'GraphQL'],
  [/graph\s*ku\s*l/gi, 'GraphQL'],
  [/kerse\s+pagination/gi, 'cursor pagination'],
  [/kara\s+pagination/gi, 'cursor pagination'],
];

const WHITESPACE_PATTERN = /\s{2,}/g;

export function normalizeTranscript(text: string): string {
  if (!text) return text;

  let out = text.trim();

  out = out.replace(BRACKET_TAG_PATTERN, ' ');
  out = out.replace(YOU_REPEAT_PATTERN, ' ');
  out = out.replace(REPEATED_TOKEN_PATTERN, '$1');
  out = out.replace(WHITESPACE_PATTERN, ' ');

  for (const [alias, replacement] of TECHNICAL_ALIASES) {
    out = out.replace(alias, replacement);
  }

  out = out.replace(WHITESPACE_PATTERN, ' ');
  return out.trim();
}