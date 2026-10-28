export interface BenchmarkConfig {
  models: string[];
  ollamaBaseUrl: string;
  contextLength?: number;
  temperature?: number;
  topP?: number;
  numTrials: number;
  warmup: boolean;
  outputDir: string;
}

export interface TestCase {
  id: string;
  category: 'general' | 'browser' | 'gaming' | 'performance';
  name: string;
  prompt: string;
  systemPrompt?: string;
  expectedFormat?: 'text' | 'json' | 'tool_call';
  scoringCriteria: ScoringCriteria;
}

export interface ScoringCriteria {
  mustHave?: string[];
  mustNotHave?: string[];
  validJson?: boolean;
  maxTokens?: number;
  objectiveCheck?: (response: string) => boolean;
}

export interface BenchmarkResult {
  model: string;
  testCaseId: string;
  trial: number;
  response: string;
  latency: {
    total: number;
    timeToFirstToken?: number;
  };
  tokensPerSecond?: number;
  tokensUsed?: number;
  valid: boolean;
  score: number;
  errors: string[];
  timestamp: string;
}

export interface BenchmarkReport {
  config: BenchmarkConfig;
  results: BenchmarkResult[];
  summary: {
    models: Record<string, ModelSummary>;
  };
  metadata: {
    timestamp: string;
    hardware: string;
    runtimeVersion?: string;
  };
}

export interface ModelSummary {
  model: string;
  totalTests: number;
  passed: number;
  avgScore: number;
  avgLatency: number;
  avgTokensPerSec: number;
}
