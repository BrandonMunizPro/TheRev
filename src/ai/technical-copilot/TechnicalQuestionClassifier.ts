import {
  TechnicalDomain,
  ClassificationResult,
  TranscriptFragment,
  DEFAULT_SESSION_CONFIG,
  SessionConfig,
} from './types';
import { findConceptsByKeywords } from './ConceptCatalog';

interface DomainPattern {
  domain: TechnicalDomain;
  patterns: RegExp[];
  keywords: string[];
  weight: number;
}

const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    patterns: [
      /duplicate\s+(processing|messages?|events?|requests?)/i,
      /idempoten/i,
      /at[\s-]least[\s-]once|exactly[\s-]once|at[\s-]most[\s-]once/i,
      /retries?.*\b(duplicate|same)\b/i,
      /service\s+discovery/i,
      /eventual\s+consistency/i,
      /saga\s+pattern/i,
      /distributed\s+(transaction|consensus|lock)/i,
    ],
    keywords: [
      'duplicate', 'idempotent', 'idempotency', 'retries', 'consumer retry',
      'at least once', 'exactly once', 'service discovery', 'saga',
      'distributed', 'partition', 'split brain',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.API_DESIGN,
    patterns: [
      /api\s+(design|version|rate\s+limit|endpoint)/i,
      /rest\s+api/i,
      /graphql/i,
      /rate\s+limit/i,
      /pagination/i,
      /too\s+many\s+requests/i,
      /429/i,
    ],
    keywords: [
      'api', 'endpoint', 'rate limit', 'graphql', 'rest', 'pagination',
      'throttle', 'version', 'api design', 'http status',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.CACHING,
    patterns: [
      /cache\s+(invalidation|miss|hit|eviction|strategy)/i,
      /slow\s+(repeated|db\s+read|query)/i,
      /precomput/i,
      /in[\s-]memory/i,
      /redis\s+(cache|cluster)/i,
      /memcached/i,
    ],
    keywords: [
      'cache', 'caching', 'redis', 'memcached', 'invalidate', 'stale',
      'precomputed', 'materialized view', 'denormalize', 'slow read',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.DATABASES_SQL,
    patterns: [
      /slow\s+(query|sql|read|database)/i,
      /database\s+(index|migration|shard)/i,
      /sql\s+(performance|optimization|query)/i,
      /connection\s+pool/i,
      /too\s+many\s+connections/i,
      /query\s+plan/i,
      /missing\s+index/i,
    ],
    keywords: [
      'slow query', 'sql', 'index', 'database', 'migration', 'shard',
      'connection pool', 'query plan', 'table scan', 'explain plan',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.MESSAGING_QUEUES,
    patterns: [
      /message\s+(queue|broker|order|loss)/i,
      /dead\s+letter/i,
      /pub\s*sub/i,
      /event\s+sourc/i,
      /kafka|rabbitmq|sqs/i,
      /consumer\s+lag/i,
    ],
    keywords: [
      'message queue', 'broker', 'kafka', 'rabbitmq', 'sqs',
      'dead letter', 'dlq', 'pub sub', 'event sourcing', 'consumer lag',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    patterns: [
      /provider\s+being\s+unavailable/i,
      /provider\s+down/i,
      /service\s+down/i,
      /circuit\s+breaker/i,
      /exponential\s+backoff/i,
      /retry\s+strategy/i,
      /health\s+check/i,
      /graceful\s+degrad/i,
      /bulkhead/i,
      /cascade\s+failure/i,
    ],
    keywords: [
      'circuit breaker', 'backoff', 'retry', 'health check', 'degradation',
      'bulkhead', 'unavailable', 'timeout', 'fallback', 'fault tolerance',
      'resilience', 'recover', 'failure',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    patterns: [
      /auth\s+(token|mechanism|flow|strategy)/i,
      /jwt|json\s+web\s+token/i,
      /oauth/i,
      /rbac|role[\s-]based/i,
      /permission\s+(model|check|denied)/i,
      /capability[\s-]based/i,
      /access\s+control/i,
    ],
    keywords: [
      'auth', 'authentication', 'authorization', 'jwt', 'oauth', 'token',
      'rbac', 'permission', 'role', 'capability', 'access control',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    patterns: [
      /auto[\s-]?scal/i,
      /load\s+balanc/i,
      /kubernetes|k8s/i,
      /container\s+(orchestrat|schedul)/i,
      /terraform|cloudformation/i,
      /infrastructure\s+as\s+code/i,
    ],
    keywords: [
      'kubernetes', 'k8s', 'docker', 'container', 'terraform', 'load balancer',
      'autoscaling', 'ec2', 'ecs', 'infrastructure', 'cloud',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.DEVOPS_CICD,
    patterns: [
      /ci\s*\/?\s*cd/i,
      /pipeline/i,
      /blue[\s-]green/i,
      /canary\s+(release|deploy)/i,
      /rollout/i,
      /rollback/i,
      /zero[\s-]downtime/i,
    ],
    keywords: [
      'ci/cd', 'pipeline', 'deploy', 'blue green', 'canary', 'rollout',
      'rollback', 'release', 'build', 'continuous',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.OOP_DESIGN,
    patterns: [
      /solid\s+principle/i,
      /design\s+pattern/i,
      /strategy\s+pattern/i,
      /factory\s+pattern/i,
      /dependency\s+(injection|inversion)/i,
      /composition\s+over\s+inheritance/i,
    ],
    keywords: [
      'solid', 'design pattern', 'factory', 'strategy', 'observer',
      'decorator', 'adapter', 'dependency injection', 'composition',
    ],
    weight: 0.9,
  },
  {
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    patterns: [
      /algorithm/i,
      /data\s+structure/i,
      /time\s+complexity/i,
      /big[\s-]?o/i,
      /sort(ing)?\s+(algorithm|complexity)/i,
      /tree|graph|hash\s+(table|map|set)/i,
    ],
    keywords: [
      'algorithm', 'data structure', 'complexity', 'big-o', 'sort',
      'binary search', 'hash table', 'tree', 'graph', 'linked list',
    ],
    weight: 0.9,
  },
  {
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    patterns: [
      /llm/i,
      /retrieval\s+augment/i,
      /rag\b/i,
      /vector\s+(search|store|database|embed)/i,
      /prompt\s+(engineer|template)/i,
      /fine[\s-]tun/i,
      /embedding/i,
    ],
    keywords: [
      'llm', 'rag', 'embedding', 'vector', 'prompt', 'fine-tune',
      'model', 'token', 'context window', 'inference',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.OBSERVABILITY,
    patterns: [
      /distributed\s+trac/i,
      /structured\s+log/i,
      /metrics\s+(and|&)\s+monitoring/i,
      /opentelemetry/i,
      /observability/i,
      /prometheus|grafana|datadog|jaeger/i,
    ],
    keywords: [
      'tracing', 'logging', 'metrics', 'monitoring', 'observability',
      'opentelemetry', 'prometheus', 'grafana', 'span', 'trace',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.CONCURRENCY,
    patterns: [
      /race\s+condition/i,
      /deadlock/i,
      /mutex|lock\b/i,
      /concurrent\s+(access|write|read)/i,
      /thread[\s-]safe/i,
      /optimistic\s+lock/i,
    ],
    keywords: [
      'race condition', 'deadlock', 'mutex', 'lock', 'concurrent',
      'thread safe', 'synchronization', 'semaphore', 'atomic',
    ],
    weight: 1.0,
  },
  {
    domain: TechnicalDomain.SYSTEM_DESIGN,
    patterns: [
      /system\s+design/i,
      /cap\s+theorem/i,
      /load\s+shedding/i,
      /data\s+consistency/i,
      /scalab/i,
      /high[\s-]?throughput/i,
      /latency/i,
    ],
    keywords: [
      'system design', 'cap theorem', 'scalability', 'throughput',
      'latency', 'load shed', 'consistency', 'high availability',
    ],
    weight: 1.0,
  },
];

const QUESTION_PATTERNS: RegExp[] = [
  /how\s+(would|do|can|should|could)\s+(you|i|we|one)/i,
  /what\s+(is|are|would|should|do|does)\b/i,
  /why\s+(is|are|would|should|do|does|wouldn)/i,
  /when\s+(should|would|do|does)\b/i,
  /where\s+(should|would|do|does)\b/i,
  /which\s+(is|are|would|should)\b/i,
  /can\s+(you|i|we|this)\b/i,
  /how\s+to\b/i,
  /best\s+way\s+to\b/i,
  /approach\s+(for|to)\b/i,
  /handle\s+(if|when|the\s+case)\b/i,
  /prevent\s+\w+/i,
  /avoid\s+\w+/i,
  /improve\s+\w+/i,
  /optimize\s+\w+/i,
];

export class TechnicalQuestionClassifier {
  private config: SessionConfig;
  private domainPatterns: DomainPattern[];

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.domainPatterns = DOMAIN_PATTERNS;
  }

  classify(text: string): ClassificationResult | null {
    const normalized = text.trim().toLowerCase();
    if (normalized.length < 5) return null;

    const questionScore = this.scoreQuestionLikelihood(normalized);
    if (questionScore < 0.3) return null;

    const domainScores = this.scoreDomains(normalized);
    if (domainScores.length === 0) return null;

    const best = domainScores[0];
    if (best.score < this.config.minConfidenceThreshold) return null;

    const matchedKeywords = this.findMatchedKeywords(normalized, best.domain);

    return {
      detectedQuestion: text.trim(),
      domain: best.domain,
      confidence: Math.min(best.score * questionScore, 1.0),
      matchedKeywords,
    };
  }

  classifyFromFragments(fragments: TranscriptFragment[]): ClassificationResult | null {
    if (fragments.length === 0) return null;

    const recentFragments = fragments.slice(-5);
    const combinedText = recentFragments.map((f) => f.text).join(' ');

    return this.classify(combinedText);
  }

  private scoreQuestionLikelihood(text: string): number {
    let score = 0;
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        score = Math.max(score, 0.8);
        break;
      }
    }

    if (/\?$/.test(text.trim())) {
      score = Math.max(score, 0.6);
    }

    const technicalTerms = findConceptsByKeywords(text);
    if (technicalTerms.length > 0) {
      score = Math.max(score, 0.5);
    }

    return score;
  }

  private scoreDomains(
    text: string
  ): Array<{ domain: TechnicalDomain; score: number }> {
    const scores = new Map<TechnicalDomain, number>();

    for (const dp of this.domainPatterns) {
      let matchScore = 0;

      for (const regex of dp.patterns) {
        if (regex.test(text)) {
          matchScore = Math.max(matchScore, dp.weight);
        }
      }

      if (matchScore === 0) {
        for (const keyword of dp.keywords) {
          if (text.includes(keyword.toLowerCase())) {
            matchScore = Math.max(matchScore, dp.weight * 0.7);
            break;
          }
        }
      }

      if (matchScore > 0) {
        const current = scores.get(dp.domain) || 0;
        scores.set(dp.domain, Math.max(current, matchScore));
      }
    }

    return Array.from(scores.entries())
      .map(([domain, score]) => ({ domain, score }))
      .sort((a, b) => b.score - a.score);
  }

  private findMatchedKeywords(text: string, domain: TechnicalDomain): string[] {
    const dp = this.domainPatterns.find((d) => d.domain === domain);
    if (!dp) return [];

    const matched: string[] = [];
    for (const keyword of dp.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }
    return matched;
  }
}
