import { AIProvider } from './AIIntentTypes';
import { adapterFactory } from './adapters';
import { SmartFallbackService } from './SmartFallbackService';
import {
  UserMemoriesModel,
  MemoryCandidate,
  ProcessResult,
} from '../models/userMemories.model';
import { MemoryType } from '../entities/UserMemory';

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system. Analyze the following exchange and extract durable information about the USER. Only extract information that is likely to remain true across sessions. Do NOT extract temporary states, one-time requests, or information that changes frequently. Return a JSON array of extracted memories. Each memory must have:
- type: one of [fact, preference, interest, relationship, goal, project]
- content: a clear, standalone sentence (e.g., "User's son lives in Thailand")
- confidence: 0.0-1.0 (how sure are you this is durable)
- importance: 1-10 (how important is this to the user's identity)
If no durable information was revealed, return an empty array [].
Return ONLY the JSON array, no other text.`;

const VALID_TYPES = new Set<string>(Object.values(MemoryType));

export interface ExtractionResult {
  candidatesFound: number;
  candidatesPersisted: number;
  candidatesSkipped: number;
  results: ProcessResult[];
}

export class MemoryExtractor {
  private readonly model: UserMemoriesModel;
  private readonly fallbackService: SmartFallbackService;

  constructor() {
    this.model = new UserMemoriesModel();
    this.fallbackService = new SmartFallbackService();
  }

  async extract(
    userId: string,
    userMessage: string,
    aiResponse: string,
    source: string = 'conversation',
    sourceInteractionId?: string
  ): Promise<ExtractionResult> {
    const provider = this.fallbackService.getBestAvailableProvider(
      AIProvider.OPEN_SOURCE
    );

    if (!provider) {
      console.warn('[Memory] No provider available for extraction');
      return {
        candidatesFound: 0,
        candidatesPersisted: 0,
        candidatesSkipped: 0,
        results: [],
      };
    }

    const adapter = adapterFactory.getAdapter(provider);
    if (!adapter) {
      console.warn(`[Memory] No adapter for provider ${provider}`);
      return {
        candidatesFound: 0,
        candidatesPersisted: 0,
        candidatesSkipped: 0,
        results: [],
      };
    }

    let candidates: MemoryCandidate[];
    try {
      const response = await adapter.complete({
        provider,
        prompt: `User message: ${userMessage}\n\nAI response: ${aiResponse}`,
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        maxTokens: 512,
        temperature: 0.3,
      });

      candidates = this.parseCandidates(response.content);
    } catch (err) {
      console.error('[Memory] Extraction AI call failed:', err);
      return {
        candidatesFound: 0,
        candidatesPersisted: 0,
        candidatesSkipped: 0,
        results: [],
      };
    }

    const results: ProcessResult[] = [];
    let persisted = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const result = await this.model.processCandidate(
        userId,
        candidate,
        source,
        sourceInteractionId
      );
      results.push(result);
      if (result.action === 'created' || result.action === 'updated') {
        persisted++;
      } else {
        skipped++;
      }
    }

    return {
      candidatesFound: candidates.length,
      candidatesPersisted: persisted,
      candidatesSkipped: skipped,
      results,
    };
  }

  private parseCandidates(raw: string): MemoryCandidate[] {
    const cleaned = raw.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item: any) => {
          return (
            item &&
            typeof item === 'object' &&
            typeof item.content === 'string' &&
            VALID_TYPES.has(item.type) &&
            typeof item.confidence === 'number' &&
            typeof item.importance === 'number'
          );
        })
        .map((item: any) => ({
          type: item.type as MemoryType,
          content: String(item.content).trim(),
          confidence: Math.max(0, Math.min(1, Number(item.confidence))),
          importance: Math.max(
            1,
            Math.min(10, Math.round(Number(item.importance)))
          ),
        }));
    } catch {
      return [];
    }
  }
}
