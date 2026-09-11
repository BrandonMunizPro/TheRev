export { TechnicalQuestionClassifier } from './TechnicalQuestionClassifier';
export { ConceptRetriever } from './ConceptRetriever';
export { TranscriptSessionManager } from './TranscriptSession';
export { TechnicalCopilotService } from './TechnicalCopilotService';
export { PromptDetector, extractPromptText } from './PromptDetector';
export { PromptLifecycle } from './PromptLifecycle';
export { normalizeTranscript } from './TranscriptNormalizer';
export { TECHNICAL_CONCEPT_CATALOG, findConceptsByKeywords, findRelatedConcepts, findConceptsByDomain, findConceptsByTopics, findTopicsByKeywords } from './ConceptCatalog';
export {
  TechnicalDomain,
  DEFAULT_SESSION_CONFIG,
} from './types';
export type {
  ConceptEntry,
  ConceptCue,
  ClassificationResult,
  TranscriptFragment,
  SessionConfig,
  CopilotSession,
  PromptDetection,
  CopilotDiagnostics,
} from './types';
export { PromptBoundaryType } from './types';
export type { CopilotProcessResult } from './TechnicalCopilotService';
