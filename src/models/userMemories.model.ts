import { UserMemoriesDao, normalizeContent } from '../dao/userMemories.dao';
import { UserMemory, MemoryType } from '../entities/UserMemory';

export interface MemoryCandidate {
  type: MemoryType;
  content: string;
  confidence: number;
  importance: number;
}

export interface ProcessResult {
  action:
    | 'created'
    | 'updated'
    | 'skipped_duplicate'
    | 'skipped_low_confidence';
  memory?: UserMemory;
  reason?: string;
}

export class UserMemoriesModel {
  private readonly dao: UserMemoriesDao;

  constructor() {
    this.dao = new UserMemoriesDao();
  }

  async getMemory(id: string): Promise<UserMemory | null> {
    return this.dao.findById(id);
  }

  async getUserMemories(userId: string): Promise<UserMemory[]> {
    return this.dao.findActiveByUserId(userId);
  }

  async processCandidate(
    userId: string,
    candidate: MemoryCandidate,
    source: string = 'conversation',
    sourceInteractionId?: string
  ): Promise<ProcessResult> {
    const normalizedKey = normalizeContent(candidate.content);

    if (normalizedKey.length === 0) {
      return {
        action: 'skipped_low_confidence',
        reason: 'Empty after normalization',
      };
    }

    if (candidate.confidence < 0.3) {
      return {
        action: 'skipped_low_confidence',
        reason: `Confidence ${candidate.confidence} below threshold`,
      };
    }

    const duplicate = await this.dao.findByNormalizedKey(userId, normalizedKey);
    if (duplicate) {
      return {
        action: 'skipped_duplicate',
        memory: duplicate,
        reason: `Matches existing memory ${duplicate.id}`,
      };
    }

    const existingByType = await this.dao.findActiveByType(
      userId,
      candidate.type
    );
    for (const existing of existingByType) {
      const similarity = this.jaccardSimilarity(
        this.wordSet(existing.content),
        this.wordSet(candidate.content)
      );

      if (similarity > 0.5) {
        const updated = await this.dao.updateMemory(existing.id, {
          content: candidate.content,
          normalizedKey,
          confidence: candidate.confidence,
          importance: candidate.importance,
        });
        return {
          action: 'updated',
          memory: updated ?? undefined,
          reason: `Updated existing memory ${existing.id} (similarity: ${similarity.toFixed(2)})`,
        };
      }
    }

    const memory = await this.dao.create({
      userId,
      type: candidate.type,
      content: candidate.content,
      normalizedKey,
      confidence: candidate.confidence,
      importance: candidate.importance,
      source,
      sourceInteractionId,
      active: true,
      accessCount: 0,
    });

    return { action: 'created', memory };
  }

  async softDelete(id: string): Promise<boolean> {
    return this.dao.softDelete(id);
  }

  async hardDelete(id: string): Promise<boolean> {
    return this.dao.hardDelete(id);
  }

  async updateMemory(
    id: string,
    data: Partial<UserMemory>
  ): Promise<UserMemory | null> {
    return this.dao.updateMemory(id, data);
  }

  async manualAdd(
    userId: string,
    type: MemoryType,
    content: string,
    importance: number = 5
  ): Promise<UserMemory> {
    const normalizedKey = normalizeContent(content);
    return this.dao.create({
      userId,
      type,
      content,
      normalizedKey,
      confidence: 1.0,
      importance,
      source: 'user_input',
      active: true,
      accessCount: 0,
    });
  }

  private wordSet(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 0)
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const word of a) {
      if (b.has(word)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
