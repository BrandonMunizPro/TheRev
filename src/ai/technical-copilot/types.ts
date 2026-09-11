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
  topic: string;
  keywords: string[];
  relatedConcepts: string[];
}

export interface TopicDefinition {
  id: string;
  domain: TechnicalDomain;
  label: string;
  keywords: string[];
}

export interface ScoredDomain {
  domain: TechnicalDomain;
  score: number;
}

export interface ScoredTopic {
  topic: string;
  domain: TechnicalDomain;
  score: number;
  matchedKeywords: string[];
}

export interface ClassificationResult {
  detectedQuestion: string;
  domain: TechnicalDomain;
  confidence: number;
  matchedKeywords: string[];
  topics?: string[];
  domainScores?: ScoredDomain[];
  topicScores?: ScoredTopic[];
  normalizedText?: string;
}

export interface RankedConcept {
  id: string;
  label: string;
  score: number;
  topic: string;
  reasons: string[];
}

export enum PromptBoundaryType {
  QUESTION = 'question',
  IMPERATIVE = 'imperative',
  SCENARIO = 'scenario',
}

export interface PromptDetection {
  isTechnicalPrompt: boolean;
  promptText: string | null;
  confidence: number;
  reason: string;
  boundaryType: PromptBoundaryType | null;
  evidence: string[];
  rejectReasons: string[];
}

export type PromptPhase =
  | 'idle'
  | 'listening'
  | 'candidate'
  | 'stabilizing'
  | 'emitted'
  | 'suppressed';

export interface RejectedTopic {
  topic: string;
  score: number;
  matchedKeywords: string[];
}

export interface CopilotDiagnostics {
  normalizedText?: string;
  promptText?: string;
  boundaryType?: PromptBoundaryType;
  detectorConfidence?: number;
  detectorReason?: string;
  detectorEvidence?: string[];
  rejectReasons?: string[];
  domains: ScoredDomain[];
  topics: ScoredTopic[];
  rejectedTopics?: RejectedTopic[];
  matchedEvidence?: string[];
  rankedConcepts: RankedConcept[];
  suppressionReason?: string;
  dedupeDecision?: string;
  contextAgeMs?: number;
  detectMs?: number;
  classifyMs?: number;
  retrieveMs?: number;
}

export interface ConceptCue {
  category: TechnicalDomain;
  detectedQuestion: string;
  concepts: string[];
  confidence: number;
  sessionId: string;
  timestamp: number;
  diagnostics?: CopilotDiagnostics;
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
  promptStabilizationMs: number;
  promptDedupeWindowMs: number;
  emitConfidenceHigh: number;
  emitConfidenceTopicBacked: number;
  detectorMinConfidence: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxContextFragments: readEnvInt('COPILOT_MAX_CONTEXT_FRAGMENTS', 20),
  sessionTimeoutMs: readEnvInt('COPILOT_SESSION_TIMEOUT_MS', 10 * 60 * 1000),
  minConfidenceThreshold: readEnvFloat('COPILOT_CONFIDENCE_THRESHOLD', 0.4),
  maxConcepts: readEnvInt('COPILOT_MAX_CONCEPTS', 6),
  promptStabilizationMs: readEnvInt('COPILOT_PROMPT_STABILIZATION_MS', 2500),
  promptDedupeWindowMs: readEnvInt(
    'COPILOT_PROMPT_DEDUPE_WINDOW_MS',
    60 * 1000
  ),
  emitConfidenceHigh: readEnvFloat('COPILOT_EMIT_CONFIDENCE_HIGH', 0.7),
  emitConfidenceTopicBacked: readEnvFloat(
    'COPILOT_EMIT_CONFIDENCE_TOPIC_BACKED',
    0.55
  ),
  detectorMinConfidence: readEnvFloat(
    'COPILOT_DETECTOR_MIN_CONFIDENCE',
    0.55
  ),
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
  lastEmittedPromptText?: string;
  lastEmittedAt?: number;
  lastSpeaker?: string;
  isActive: boolean;
}
