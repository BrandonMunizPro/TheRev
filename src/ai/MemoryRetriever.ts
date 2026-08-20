import { AppDataSource } from '../data-source';
import { UserMemory } from '../entities/UserMemory';
import { UserMemoriesDao } from '../dao/userMemories.dao';

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'but',
  'and',
  'or',
  'if',
  'while',
  'about',
  'up',
  'it',
  'its',
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'ourselves',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'he',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'they',
  'them',
  'their',
  'theirs',
  'themselves',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'am',
  'please',
  'thank',
  'thanks',
  'hello',
  'hi',
]);

const TOKEN_BUDGET = 8;

export interface RetrievalDebug {
  queryKeywords: string[];
  candidatesConsidered: number;
  candidatesMatched: number;
  selectedMemories: string[];
  selectionReasons: Map<string, string>;
  totalTokensEstimated: number;
}

export interface RetrievalResult {
  memories: UserMemory[];
  debug: RetrievalDebug;
}

export class MemoryRetriever {
  private readonly dao: UserMemoriesDao;

  constructor() {
    this.dao = new UserMemoriesDao();
  }

  async retrieveRelevant(
    userId: string,
    messageText: string,
    limit: number = 8
  ): Promise<RetrievalResult> {
    const keywords = this.extractKeywords(messageText);
    const debug: RetrievalDebug = {
      queryKeywords: keywords,
      candidatesConsidered: 0,
      candidatesMatched: 0,
      selectedMemories: [],
      selectionReasons: new Map(),
      totalTokensEstimated: 0,
    };

    const totalMemories = await this.dao.countActiveByUserId(userId);
    debug.candidatesConsidered = totalMemories;

    if (totalMemories === 0) {
      return { memories: [], debug };
    }

    let candidates: (UserMemory & { rank: number })[] = [];

    if (keywords.length > 0) {
      const query = keywords.join(' ');
      candidates = await this.dao.searchFullText(userId, query, 20);
      debug.candidatesMatched = candidates.length;
    }

    let fallbackMemories: UserMemory[] = [];
    if (candidates.length < 3) {
      fallbackMemories = await this.dao.findTopImportant(userId, 5);
    }

    const scored = new Map<
      string,
      { memory: UserMemory; score: number; reason: string }
    >();

    for (const c of candidates) {
      const recency = this.recencyScore(c.lastAccessedAt);
      const importanceScore = c.importance / 10;
      const finalScore = 0.5 * c.rank + 0.3 * importanceScore + 0.2 * recency;
      scored.set(c.id, {
        memory: c,
        score: finalScore,
        reason: `keyword_match(rank=${c.rank.toFixed(2)}, imp=${c.importance}, rec=${recency.toFixed(2)})`,
      });
    }

    for (const fm of fallbackMemories) {
      if (!scored.has(fm.id)) {
        const recency = this.recencyScore(fm.lastAccessedAt);
        const importanceScore = fm.importance / 10;
        const finalScore = 0.1 * importanceScore + 0.1 * recency;
        scored.set(fm.id, {
          memory: fm,
          score: finalScore,
          reason: `fallback(imp=${fm.importance}, rec=${recency.toFixed(2)})`,
        });
      }
    }

    const sorted = [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const selected: UserMemory[] = [];
    let estimatedTokens = 0;

    for (const item of sorted) {
      const memTokens = Math.ceil(item.memory.content.length / 4);
      if (estimatedTokens + memTokens > TOKEN_BUDGET * 25) break;
      selected.push(item.memory);
      estimatedTokens += memTokens;
      debug.selectedMemories.push(item.memory.id);
      debug.selectionReasons.set(item.memory.id, item.reason);
    }

    debug.totalTokensEstimated = estimatedTokens;

    this.updateAccessMetadataBatch(selected.map((m) => m.id));

    return { memories: selected, debug };
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .slice(0, 10);
  }

  private recencyScore(lastAccessedAt: Date | null | undefined): number {
    if (!lastAccessedAt) return 0.1;
    const daysSince =
      (Date.now() - new Date(lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
    return 1.0 / (1 + daysSince);
  }

  private updateAccessMetadataBatch(ids: string[]): void {
    for (const id of ids) {
      this.dao.updateAccessMetadata(id).catch(() => {});
    }
  }
}
