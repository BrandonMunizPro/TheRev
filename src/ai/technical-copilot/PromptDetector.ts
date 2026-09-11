import {
  PromptDetection,
  PromptBoundaryType,
  TranscriptFragment,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
} from './types';
import {
  findConceptsByKeywords,
  findTopicsByKeywords,
} from './ConceptCatalog';

const QUESTION_DETAIL_PATTERNS: RegExp[] = [
  /\bhow\s+(would|do|can|should|could|to)\b/i,
  /\bwhat\s+(is|are|would|should|do|does)\b/i,
  /\bwhy\s+(is|are|would|should|do|does|wouldn)\b/i,
  /\bwhen\s+(should|would|do|does)\b/i,
  /\bwhere\s+(should|would|do|does)\b/i,
  /\bwhich\s+(is|are|would|should)\b/i,
  /\bdo\s+(you|we|the)\b/i,
  /\bcan\s+(you|we|i|the)\b/i,
  /\bdoes\s+(it|the|this)\b/i,
  /\bwhat\s+would\s+you\b/i,
  /\bwhat\s+happens\s+(if|when)\b/i,
  /\bwhat\s+about\b/i,
  /\bwhat\s+if\b/i,
  /\bwhat\s+when\b/i,
  /\bwhat\s+approach\b/i,
  /\bwhat\s+method\b/i,
  /\bwhat\s+strategy\b/i,
  /\bwhat\s+technique\b/i,
  /\bwhat\s+pattern\b/i,
  /\bhow\s+about\b/i,
  /\bhow\s+does\s+the\b/i,
  /\bhow\s+do\s+we\b/i,
];

const IMPERATIVE_OPENING_PATTERN =
  /\b(design|build|implement|architect|write|explain|describe|outline|list|write|compare|contrast|walk\s+me\s+through|tell\s+me|show\s+me|consider)\b/i;

const SCENARIO_OPENING_PATTERN =
  /\b(imagine|suppose|pretend|assume|given)\b|(?:you|we)['']re\s+(?:designing|building|creating|implementing)/i;

const TECHNICAL_PATTERNS_IN_PROMPT: RegExp[] = [
  /\b(design|build|architect|implement|handle|prevent|avoid|implement|optimize|improve)\b/i,
  /\b(system|api|pipeline|service|algorithm|architecture|protocol|infrastructure)\b/i,
];

const COACHING_PATTERNS: RegExp[] = [
  /\bthe\s+goal\s+isn['']?t\b/i,
  /\bthat['']?s\s+(fair|good|great|right|correct|true|interesting|helpful)\b/i,
  /\bi\s+think\s+that['']?s?\b/i,
  /\bfor\s+sure\b/i,
  /\b(good|great|nice)\s+point\b/i,
  /\bfair\s+enough\b/i,
  /\bfor\s+sure\b/i,
  /\b(luckily|unfortunately)\s+it['']?s\s+not\b/i,
  /\block\s+in\b/i,
  /\bmemoriz/i,
  /\btrigger\s+line\b/i,
  /\bparagraph\b/i,
  /\bquite\s+(a\s+bit|good|nice|a\s+lot)\b/i,
  /\bbasically\s+just\b/i,
  /\bjust\s+be(?:ing)?\b/i,
];

function containsNonTechnicalMarkers(text: string): boolean {
  return COACHING_PATTERNS.some((p) => p.test(text));
}

function sentenceSplit(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+|\s{2,}/);
  return parts.filter((p) => p.trim().length > 0);
}

export function extractPromptText(rollingText: string): string | null {
  const trimmed = rollingText.trim();
  if (trimmed.length < 5) return null;

  if (/[.!?]\s*$/.test(trimmed)) return trimmed;

  const parts = sentenceSplit(trimmed);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    if (part.length < 4) continue;
    if (hasBoundary(part)) return part;
  }
  if (parts.length > 0) return trimmed;
  return trimmed;
}

function hasBoundary(text: string): boolean {
  if (QUESTION_DETAIL_PATTERNS.some((p) => p.test(text))) return true;
  if (IMPERATIVE_OPENING_PATTERN.test(text)) return true;
  if (SCENARIO_OPENING_PATTERN.test(text)) return true;
  if (/[.!?]\s*$/.test(text)) {
    if (TECHNICAL_PATTERNS_IN_PROMPT.some((p) => p.test(text))) return true;
  }
  return false;
}

function getBoundaryType(text: string): PromptBoundaryType | null {
  if (QUESTION_DETAIL_PATTERNS.some((p) => p.test(text)))
    return PromptBoundaryType.QUESTION;
  if (SCENARIO_OPENING_PATTERN.test(text))
    return PromptBoundaryType.SCENARIO;
  if (IMPERATIVE_OPENING_PATTERN.test(text))
    return PromptBoundaryType.IMPERATIVE;
  return null;
}

function computeDetectorConfidence(
  promptText: string,
  boundaryType: PromptBoundaryType | null,
  contextText: string,
  detectorConfig: SessionConfig,
): { confidence: number; isTechnical: boolean; reason: string; evidence: string[]; rejectReasons: string[] } {
  if (!boundaryType || !promptText) {
    return {
      confidence: 0,
      isTechnical: false,
      reason: 'no boundary marker detected',
      evidence: [],
      rejectReasons: ['no boundary'],
    };
  }

  const target = promptText + (contextText ? ' ' + contextText : '');

  const topicMatches = findTopicsByKeywords(promptText);
  const conceptMatches = findConceptsByKeywords(promptText);

  const contextTopicMatches = contextText.length > 0 ? findTopicsByKeywords(target) : [];
  const contextConceptMatches = contextText.length > 0 ? findConceptsByKeywords(target) : [];

  const strongTopicHits = topicMatches.filter((t) => t.score >= 0.75);
  const contextStrongTopicHits = contextTopicMatches.filter((t) => t.score >= 0.75);
  const allStrongTopicHits = [...strongTopicHits, ...contextStrongTopicHits.filter(ct => !strongTopicHits.some(t => t.topic.id === ct.topic.id))];

  const strongConceptHits = conceptMatches.length;
  const contextStrongConceptHits = contextConceptMatches.length;

  let confidence = 0;
  let reason = '';
  const evidence: string[] = [];
  const rejectReasons: string[] = [];

  if (boundaryType === PromptBoundaryType.QUESTION) {
    confidence += 0.35;
    evidence.push('question boundary');
  } else if (boundaryType === PromptBoundaryType.IMPERATIVE) {
    confidence += 0.30;
    evidence.push('imperative boundary');
  } else if (boundaryType === PromptBoundaryType.SCENARIO) {
    confidence += 0.25;
    evidence.push('scenario boundary');
  }

  if (strongTopicHits.length > 0 || strongConceptHits >= 2) {
    confidence += 0.40;
    reason = 'strong technical evidence';
    strongTopicHits.forEach((t) => evidence.push(`topic:${t.topic.id}`));
    strongConceptHits > 0 && evidence.push(`${strongConceptHits} concept matches`);
  } else if (allStrongTopicHits.length > 0 || contextStrongConceptHits >= 2) {
    confidence += 0.30;
    reason = 'technical evidence via context support';
    allStrongTopicHits.forEach((t) => evidence.push(`topic:${t.topic.id}(context)`));
    contextStrongConceptHits > 0 && evidence.push(`${contextStrongConceptHits} concept matches(context)`);
  } else if (TECHNICAL_PATTERNS_IN_PROMPT.some((p) => p.test(promptText))) {
    confidence += 0.20;
    reason = 'design/implement boundary vocabulary';
  } else {
    confidence += 0.05;
    reason = 'no technical evidence';
    rejectReasons.push('no technical evidence');
  }

  const coachingMatchCount = COACHING_PATTERNS.filter((p) => p.test(promptText)).length
    + COACHING_PATTERNS.filter((p) => p.test(target)).length;
  const coachingPenalty = Math.min(coachingMatchCount * 0.15, 0.50);
  confidence -= coachingPenalty;
  if (coachingPenalty > 0) {
    rejectReasons.push(`coaching penalty: -${coachingPenalty.toFixed(2)}`);
  }

  confidence = Math.max(0, Math.min(1, confidence));

  const isTechnical = confidence >= detectorConfig.detectorMinConfidence;

  return {
    confidence: Math.round(confidence * 1000) / 1000,
    isTechnical,
    reason: reason || (isTechnical ? 'technical prompt detected' : 'below confidence threshold'),
    evidence,
    rejectReasons,
  };
}

export class PromptDetector {
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  detect(
    normalizedText: string,
    rollingFragments?: TranscriptFragment[],
  ): PromptDetection {
    const trimmed = normalizedText.trim();
    if (trimmed.length < 5) {
      return this.reject(trimmed, 'text too short');
    }

    const promptText = extractPromptText(trimmed);
    if (!promptText) {
      return this.reject(trimmed, 'no prompt text extracted');
    }

    const boundaryType = getBoundaryType(promptText);

    const contextText = (rollingFragments || []).slice(-3).map((f) => f.text).join(' ');
    const { confidence, isTechnical, reason, evidence, rejectReasons } =
      computeDetectorConfidence(promptText, boundaryType, contextText, this.config);

    const isNonTechnical = containsNonTechnicalMarkers(promptText);
    const finalRejectReasons = [...rejectReasons];
    if (isNonTechnical) {
      finalRejectReasons.push('non-technical coaching language detected');
    }

    const finalConfidence = isNonTechnical ? Math.min(confidence, 0.15) : confidence;
    const finalIsTechnical = isNonTechnical ? false : isTechnical;

    return {
      isTechnicalPrompt: finalIsTechnical,
      promptText,
      confidence: finalConfidence,
      reason: finalIsTechnical
        ? reason
        : (finalRejectReasons.join('; ') || 'below threshold'),
      boundaryType,
      evidence,
      rejectReasons: finalRejectReasons,
    };
  }

  private reject(normalizedText: string, reason: string): PromptDetection {
    return {
      isTechnicalPrompt: false,
      promptText: normalizedText || null,
      confidence: 0,
      reason,
      boundaryType: null,
      evidence: [],
      rejectReasons: [reason],
    };
  }
}