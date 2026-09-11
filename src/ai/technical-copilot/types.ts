export enum TechnicalDomain {
  DISTRIBUTED_SYSTEMS = 'distributed_systems',
  API_DESIGN = 'api_design',
  DATABASES_SQL = 'databases_sql',
  CACHING = 'caching',
  MESSAGING_QUEUES = 'messaging_queues',
  RELIABILITY_FAULT_TOLERANCE = 'reliability_fault_tolerance',
  AUTH_AUTHORIZATION = 'auth_authorization',
  CLOUD_INFRASTRUCTURE = 'cloud_infrastructure',
  DEVOPS_CICD = 'devops_cicd',
  OOP_DESIGN = 'oop_design',
  ALGORITHMS_DATA_STRUCTURES = 'algorithms_data_structures',
  AI_LLM_SYSTEMS = 'ai_llm_systems',
  OBSERVABILITY = 'observability',
  CONCURRENCY = 'concurrency',
  SYSTEM_DESIGN = 'system_design',
  GENERAL_ENGINEERING = 'general_engineering',
}

export interface ConceptEntry {
  id: string;
  label: string;
  domain: TechnicalDomain;
  keywords: string[];
  relatedConcepts: string[];
}

export interface ClassificationResult {
  detectedQuestion: string;
  domain: TechnicalDomain;
  confidence: number;
  matchedKeywords: string[];
}

export interface ConceptCue {
  category: TechnicalDomain;
  detectedQuestion: string;
  concepts: string[];
  confidence: number;
  sessionId: string;
  timestamp: number;
}

export interface TranscriptFragment {
  text: string;
  timestamp: number;
  speaker?: string;
}

export interface SessionConfig {
  maxContextFragments: number;
  sessionTimeoutMs: number;
  minConfidenceThreshold: number;
  maxConcepts: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxContextFragments: readEnvInt('COPILOT_MAX_CONTEXT_FRAGMENTS', 20),
  sessionTimeoutMs: readEnvInt('COPILOT_SESSION_TIMEOUT_MS', 10 * 60 * 1000),
  minConfidenceThreshold: readEnvFloat('COPILOT_CONFIDENCE_THRESHOLD', 0.4),
  maxConcepts: readEnvInt('COPILOT_MAX_CONCEPTS', 6),
};

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || isNaN(parseInt(raw, 10))) return fallback;
  return parseInt(raw, 10);
}

function readEnvFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || isNaN(parseFloat(raw))) return fallback;
  return parseFloat(raw);
}

export interface CopilotSession {
  id: string;
  userId: string;
  startedAt: number;
  lastActivityAt: number;
  fragments: TranscriptFragment[];
  lastCue?: ConceptCue;
  isActive: boolean;
}
