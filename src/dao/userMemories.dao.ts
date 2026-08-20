import { AppDataSource } from '../data-source';
import { UserMemory, MemoryType } from '../entities/UserMemory';
import { Repository } from 'typeorm';

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
]);

function simpleStem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ting')) return word.slice(0, -1);
  if (word.endsWith('ing')) return word.slice(0, -3);
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ness')) return word.slice(0, -4);
  if (word.endsWith('ment')) return word.slice(0, -4);
  if (word.endsWith('tion')) return word.slice(0, -4);
  if (word.endsWith('ness')) return word.slice(0, -4);
  if (word.endsWith('ly')) return word.slice(0, -2);
  if (word.endsWith('ed')) return word.slice(0, -2);
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .map(simpleStem)
    .sort()
    .filter((w, i, arr) => i === arr.indexOf(w))
    .join(' ');
}

export class UserMemoriesDao {
  private get repo(): Repository<UserMemory> {
    return AppDataSource.getRepository(UserMemory);
  }

  async create(data: Partial<UserMemory>): Promise<UserMemory> {
    const memory = this.repo.create(data);
    return this.repo.save(memory);
  }

  async findById(id: string): Promise<UserMemory | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findActiveByUserId(userId: string): Promise<UserMemory[]> {
    return this.repo.find({ where: { userId, active: true } });
  }

  async findByNormalizedKey(
    userId: string,
    normalizedKey: string
  ): Promise<UserMemory | null> {
    return this.repo.findOne({
      where: { userId, normalizedKey, active: true },
    });
  }

  async findActiveByType(
    userId: string,
    type: MemoryType
  ): Promise<UserMemory[]> {
    return this.repo.find({ where: { userId, type, active: true } });
  }

  async searchFullText(
    userId: string,
    query: string,
    limit: number = 20
  ): Promise<(UserMemory & { rank: number })[]> {
    const results = await this.repo
      .createQueryBuilder('memory')
      .select([
        'memory.id',
        'memory.userId',
        'memory.type',
        'memory.content',
        'memory.normalizedKey',
        'memory.confidence',
        'memory.importance',
        'memory.source',
        'memory.sourceInteractionId',
        'memory.createdAt',
        'memory.updatedAt',
        'memory.lastAccessedAt',
        'memory.accessCount',
        'memory.active',
      ])
      .addSelect(
        `ts_rank(memory.search_vector, plainto_tsquery('english', :query))`,
        'rank'
      )
      .where('memory.user_id = :userId', { userId })
      .andWhere('memory.active = true')
      .andWhere(`memory.search_vector @@ plainto_tsquery('english', :query)`, {
        query,
      })
      .orderBy('rank', 'DESC')
      .take(limit)
      .getRawAndEntities();

    return results.entities.map((entity, i) => ({
      ...entity,
      rank: results.raw[i]?.rank ?? 0,
    }));
  }

  async findTopImportant(
    userId: string,
    limit: number = 5
  ): Promise<UserMemory[]> {
    return this.repo.find({
      where: { userId, active: true },
      order: { importance: 'DESC', lastAccessedAt: 'DESC' },
      take: limit,
    });
  }

  async updateAccessMetadata(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(UserMemory)
      .set({
        lastAccessedAt: () => 'NOW()',
        accessCount: () => 'access_count + 1',
      })
      .where('id = :id', { id })
      .execute();
  }

  async updateMemory(
    id: string,
    data: Partial<UserMemory>
  ): Promise<UserMemory | null> {
    await this.repo.update({ id }, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repo.update({ id }, { active: false });
    return (result.affected ?? 0) > 0;
  }

  async hardDelete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }

  async countActiveByUserId(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, active: true } });
  }
}
