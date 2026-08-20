import { UserMemory } from '../entities/UserMemory';

const HEADER = 'Things Rev knows about this user:';
const MAX_TOKENS = 300;

export class MemoryPromptBuilder {
  build(memories: UserMemory[]): string {
    if (memories.length === 0) return '';

    const lines: string[] = [];
    let tokenEstimate = this.estimateTokens(HEADER);

    for (const memory of memories) {
      const line = `- ${memory.content} (${memory.type})`;
      const lineTokens = this.estimateTokens(line);
      if (tokenEstimate + lineTokens > MAX_TOKENS) break;
      lines.push(line);
      tokenEstimate += lineTokens;
    }

    if (lines.length === 0) return '';

    return `${HEADER}\n${lines.join('\n')}`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
