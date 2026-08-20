import { UserMemory, MemoryType } from '../entities/UserMemory';

const RELATIONSHIP_KEYWORDS = [
  'son',
  'daughter',
  'wife',
  'husband',
  'mother',
  'father',
  'brother',
  'sister',
  'friend',
  'coworker',
  'colleague',
  'boss',
  'neighbor',
];

const PERSONAL_IDENTIFIER_PATTERN =
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\w+@\w+\.\w+\b|\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/;

export class MemoryPrivacyFilter {
  filter(memories: UserMemory[], provider: string): UserMemory[] {
    const isLocal = provider === 'open_source' || provider === 'ollama';

    if (isLocal) return memories;

    return memories.filter((m) => {
      if (m.confidence < 0.7 && m.importance < 8) return false;
      if (m.type === MemoryType.RELATIONSHIP) return false;
      if (
        m.type === MemoryType.FACT &&
        PERSONAL_IDENTIFIER_PATTERN.test(m.content)
      )
        return false;
      if (m.type === MemoryType.FACT) {
        const lower = m.content.toLowerCase();
        if (RELATIONSHIP_KEYWORDS.some((kw) => lower.includes(kw)))
          return false;
      }
      return true;
    });
  }
}
