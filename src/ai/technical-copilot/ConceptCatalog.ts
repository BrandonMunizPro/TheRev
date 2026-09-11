import { ConceptEntry, TechnicalDomain } from './types';

export const TECHNICAL_CONCEPT_CATALOG: ConceptEntry[] = [
  // Distributed Systems
  {
    id: 'idempotency',
    label: 'idempotency',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['duplicate', 'retry', 'idempotent', 'replay', 'same request twice'],
    relatedConcepts: ['idempotency key', 'deduplication store', 'at-least-once delivery', 'transactional boundary'],
  },
  {
    id: 'idempotency_key',
    label: 'idempotency key',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['idempotency key', 'unique key', 'request key', 'dedup key'],
    relatedConcepts: ['idempotency', 'deduplication store', 'idempotent API'],
  },
  {
    id: 'deduplication_store',
    label: 'deduplication store',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['dedup', 'deduplication', 'duplicate detection', 'seen requests'],
    relatedConcepts: ['idempotency', 'idempotency key', 'bloom filter'],
  },
  {
    id: 'at_least_once_delivery',
    label: 'at-least-once delivery',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['at least once', 'reliable delivery', 'message redelivery', 'consumer retry'],
    relatedConcepts: ['idempotency', 'dead letter queue', 'message acknowledgment'],
  },
  {
    id: 'exactly_once_semantics',
    label: 'exactly-once semantics',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['exactly once', 'exactly-once', 'no duplication', 'precisely once'],
    relatedConcepts: ['idempotency', 'transactional outbox', 'two-phase commit'],
  },
  {
    id: 'service_discovery',
    label: 'service discovery',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['service discovery', 'service registry', 'find services', 'locate service'],
    relatedConcepts: ['load balancer', 'health check', 'DNS-based discovery'],
  },
  {
    id: 'eventual_consistency',
    label: 'eventual consistency',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['eventual consistency', 'consistency model', 'replication lag', 'converge'],
    relatedConcepts: ['CAP theorem', 'conflict resolution', 'vector clock'],
  },
  {
    id: 'saga_pattern',
    label: 'saga pattern',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    keywords: ['saga', 'distributed transaction', 'compensating transaction', 'choreography'],
    relatedConcepts: ['two-phase commit', 'eventual consistency', 'compensating action'],
  },

  // API Design
  {
    id: 'rate_limiting',
    label: 'rate limiting',
    domain: TechnicalDomain.API_DESIGN,
    keywords: ['rate limit', 'throttle', 'too many requests', '429', 'rate limiting'],
    relatedConcepts: ['token bucket', 'sliding window', 'backoff strategy', 'provider rate limits'],
  },
  {
    id: 'pagination',
    label: 'pagination',
    domain: TechnicalDomain.API_DESIGN,
    keywords: ['pagination', 'offset', 'cursor', 'page size', 'paginate'],
    relatedConcepts: ['cursor-based pagination', 'keyset pagination', 'infinite scroll'],
  },
  {
    id: 'api_versioning',
    label: 'API versioning',
    domain: TechnicalDomain.API_DESIGN,
    keywords: ['api version', 'versioning', 'backward compatibility', 'breaking change'],
    relatedConcepts: ['header versioning', 'URL versioning', 'content negotiation'],
  },
  {
    id: 'hateoas',
    label: 'HATEOAS',
    domain: TechnicalDomain.API_DESIGN,
    keywords: ['hateoas', 'hypermedia', 'hyperlink', 'resource links'],
    relatedConcepts: ['REST maturity model', 'content negotiation', 'link relations'],
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    domain: TechnicalDomain.API_DESIGN,
    keywords: ['graphql', 'mutation', 'subscription', 'query', 'resolver', 'schema'],
    relatedConcepts: ['N+1 problem', 'data loader', 'schema stitching', 'federation'],
  },

  // Caching
  {
    id: 'cache_invalidation',
    label: 'cache invalidation',
    domain: TechnicalDomain.CACHING,
    keywords: ['cache invalidation', 'stale cache', 'invalidate', 'cache bust'],
    relatedConcepts: ['TTL', 'cache-aside', 'write-through', 'cache coherence'],
  },
  {
    id: 'cache_aside',
    label: 'cache-aside pattern',
    domain: TechnicalDomain.CACHING,
    keywords: ['cache aside', 'lazy loading', 'read-through', 'check cache first'],
    relatedConcepts: ['write-through', 'write-behind', 'cache invalidation'],
  },
  {
    id: 'write_through',
    label: 'write-through cache',
    domain: TechnicalDomain.CACHING,
    keywords: ['write through', 'write-through', 'synchronous write', 'cache write'],
    relatedConcepts: ['write-behind', 'cache-aside', 'consistency'],
  },
  {
    id: 'memcached',
    label: 'Memcached / Redis caching',
    domain: TechnicalDomain.CACHING,
    keywords: ['memcached', 'redis cache', 'distributed cache', 'in-memory cache'],
    relatedConcepts: ['cache eviction', 'consistent hashing', 'cache clustering'],
  },
  {
    id: 'cdn_caching',
    label: 'CDN caching',
    domain: TechnicalDomain.CACHING,
    keywords: ['cdn', 'edge cache', 'content delivery', 'static asset cache'],
    relatedConcepts: ['cache invalidation', 'cache headers', 'origin shield'],
  },

  // Databases / SQL
  {
    id: 'database_indexing',
    label: 'database indexing',
    domain: TechnicalDomain.DATABASES_SQL,
    keywords: ['index', 'slow query', 'query performance', 'b-tree', 'composite index'],
    relatedConcepts: ['query plan', 'covering index', 'index scan', 'table scan'],
  },
  {
    id: 'query_plan',
    label: 'query plan optimization',
    domain: TechnicalDomain.DATABASES_SQL,
    keywords: ['query plan', 'explain', 'execution plan', 'slow query'],
    relatedConcepts: ['index', 'join optimization', 'statistics', 'cost-based optimizer'],
  },
  {
    id: 'materialized_view',
    label: 'materialized view',
    domain: TechnicalDomain.DATABASES_SQL,
    keywords: ['materialized view', 'precomputed', 'precompute', 'aggregate table'],
    relatedConcepts: ['query performance', 'denormalization', 'refresh strategy'],
  },
  {
    id: 'connection_pooling',
    label: 'connection pooling',
    domain: TechnicalDomain.DATABASES_SQL,
    keywords: ['connection pool', 'pool exhaustion', 'too many connections', 'PgBouncer'],
    relatedConcepts: ['connection limit', 'pool sizing', 'idle timeout'],
  },
  {
    id: 'database_migration',
    label: 'database migration',
    domain: TechnicalDomain.DATABASES_SQL,
    keywords: ['migration', 'schema change', 'alter table', 'data migration'],
    relatedConcepts: ['blue-green deployment', 'backward compatible migration', 'expand-contract'],
  },
  {
    id: 'sharding',
    label: 'database sharding',
    domain: TechnicalDomain.DATABASES_SQL,
    keywords: ['shard', 'sharding', 'horizontal partition', 'partition key'],
    relatedConcepts: ['cross-shard query', 'rebalancing', 'consistent hashing'],
  },

  // Messaging / Queues
  {
    id: 'dead_letter_queue',
    label: 'dead letter queue',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    keywords: ['dead letter', 'DLQ', 'poison message', 'failed message'],
    relatedConcepts: ['retry policy', 'message acknowledgment', 'circuit breaker'],
  },
  {
    id: 'message_broker',
    label: 'message broker',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    keywords: ['message broker', 'kafka', 'rabbitmq', 'sqs', 'pub sub'],
    relatedConcepts: ['consumer group', 'partition', 'message ordering', 'backpressure'],
  },
  {
    id: 'pub_sub',
    label: 'publish-subscribe',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    keywords: ['pub sub', 'publish subscribe', 'topic', 'broadcast', 'fan out'],
    relatedConcepts: ['message broker', 'event-driven', 'WebSocket'],
  },
  {
    id: 'event_sourcing',
    label: 'event sourcing',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    keywords: ['event source', 'event store', 'event log', 'append-only log'],
    relatedConcepts: ['CQRS', 'projection', 'replay events', 'snapshot'],
  },

  // Reliability / Fault Tolerance
  {
    id: 'circuit_breaker',
    label: 'circuit breaker',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['circuit breaker', 'circuit break', 'provider unavailable', 'cascade failure', 'open circuit'],
    relatedConcepts: ['exponential backoff', 'retry policy', 'bulkhead', 'fallback'],
  },
  {
    id: 'exponential_backoff',
    label: 'exponential backoff',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['exponential backoff', 'backoff', 'retry delay', 'jitter', 'retry strategy'],
    relatedConcepts: ['circuit breaker', 'retry budget', 'jitter', 'backoff strategy'],
  },
  {
    id: 'retry_policy',
    label: 'retry policy',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['retry', 'retries', 'retry policy', 'retry count', 'should retry'],
    relatedConcepts: ['exponential backoff', 'retry budget', 'circuit breaker'],
  },
  {
    id: 'health_check',
    label: 'health check',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['health check', 'health probe', 'liveness', 'readiness', 'is healthy'],
    relatedConcepts: ['circuit breaker', 'load balancer', 'graceful degradation'],
  },
  {
    id: 'graceful_degradation',
    label: 'graceful degradation',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['degradation', 'graceful', 'fallback', 'reduced functionality', 'partial failure'],
    relatedConcepts: ['circuit breaker', 'fallback', 'bulkhead', 'feature flag'],
  },
  {
    id: 'bulkhead',
    label: 'bulkhead pattern',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['bulkhead', 'isolation', 'resource isolation', 'failure isolation'],
    relatedConcepts: ['circuit breaker', 'thread pool isolation', 'connection pool isolation'],
  },
  {
    id: 'chaos_engineering',
    label: 'chaos engineering',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    keywords: ['chaos', 'fault injection', 'game day', 'resilience testing'],
    relatedConcepts: ['circuit breaker', 'bulkhead', 'failure mode'],
  },

  // Auth / Authorization
  {
    id: 'jwt',
    label: 'JWT tokens',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    keywords: ['jwt', 'json web token', 'token refresh', 'access token', 'refresh token'],
    relatedConcepts: ['token rotation', 'token revocation', 'OAuth', 'session management'],
  },
  {
    id: 'oauth',
    label: 'OAuth 2.0',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    keywords: ['oauth', 'authorization code', 'client credentials', 'token exchange'],
    relatedConcepts: ['JWT', 'OpenID Connect', 'PKCE', 'scope'],
  },
  {
    id: 'rbac',
    label: 'role-based access control',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    keywords: ['rbac', 'role', 'permission', 'authorization', 'access control'],
    relatedConcepts: ['ABAC', 'capability', 'policy engine', 'least privilege'],
  },
  {
    id: 'capability_model',
    label: 'capability-based access',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    keywords: ['capability', 'entitlement', 'feature flag', 'access grant'],
    relatedConcepts: ['RBAC', 'ABAC', 'permission', 'authorization middleware'],
  },

  // Cloud / Infrastructure
  {
    id: 'auto_scaling',
    label: 'auto-scaling',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    keywords: ['auto scale', 'autoscaling', 'scale out', 'scale up', 'horizontal scaling'],
    relatedConcepts: ['load balancer', 'instance pool', 'scaling policy', 'cool down'],
  },
  {
    id: 'load_balancer',
    label: 'load balancer',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    keywords: ['load balancer', 'traffic distribution', 'round robin', 'least connections'],
    relatedConcepts: ['health check', 'sticky session', 'TLS termination', 'auto scaling'],
  },
  {
    id: 'container_orchestration',
    label: 'container orchestration',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    keywords: ['kubernetes', 'k8s', 'container', 'pod', 'deployment', 'docker'],
    relatedConcepts: ['service mesh', 'sidecar', 'rolling update', 'configmap'],
  },
  {
    id: 'infrastructure_as_code',
    label: 'infrastructure as code',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    keywords: ['terraform', 'infrastructure as code', 'iac', 'cloudformation', 'pulumi'],
    relatedConcepts: ['state management', 'drift detection', 'module', 'plan'],
  },

  // DevOps / CI/CD
  {
    id: 'ci_cd_pipeline',
    label: 'CI/CD pipeline',
    domain: TechnicalDomain.DEVOPS_CICD,
    keywords: ['ci/cd', 'pipeline', 'build', 'deploy', 'continuous integration', 'continuous deployment'],
    relatedConcepts: ['blue-green deployment', 'canary release', 'feature flag', 'rollback'],
  },
  {
    id: 'blue_green_deployment',
    label: 'blue-green deployment',
    domain: TechnicalDomain.DEVOPS_CICD,
    keywords: ['blue green', 'blue-green', 'zero downtime', 'swap traffic'],
    relatedConcepts: ['canary release', 'rolling update', 'rollback'],
  },
  {
    id: 'canary_release',
    label: 'canary release',
    domain: TechnicalDomain.DEVOPS_CICD,
    keywords: ['canary', 'gradual rollout', 'percent rollout', 'feature flag rollout'],
    relatedConcepts: ['blue-green deployment', 'A/B testing', 'feature flag'],
  },

  // OOP / Design
  {
    id: 'solid_principles',
    label: 'SOLID principles',
    domain: TechnicalDomain.OOP_DESIGN,
    keywords: ['solid', 'single responsibility', 'open closed', 'dependency inversion', 'interface segregation'],
    relatedConcepts: ['design patterns', 'composition over inheritance', 'dependency injection'],
  },
  {
    id: 'design_patterns',
    label: 'design patterns',
    domain: TechnicalDomain.OOP_DESIGN,
    keywords: ['design pattern', 'factory', 'strategy', 'observer', 'decorator', 'adapter pattern'],
    relatedConcepts: ['SOLID', 'composition', 'interface'],
  },
  {
    id: 'strategy_pattern',
    label: 'strategy pattern',
    domain: TechnicalDomain.OOP_DESIGN,
    keywords: ['strategy', 'swap algorithm', 'plug algorithm', 'interchangeable'],
    relatedConcepts: ['adapter pattern', 'dependency injection', 'composition'],
  },

  // Algorithms / Data Structures
  {
    id: 'binary_search',
    label: 'binary search',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    keywords: ['binary search', 'log n', 'sorted search', 'divide and conquer'],
    relatedConcepts: ['search algorithm', 'sorted array', 'bisect'],
  },
  {
    id: 'hash_table',
    label: 'hash table',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    keywords: ['hash', 'hashmap', 'hash table', 'dictionary', 'o(1) lookup'],
    relatedConcepts: ['collision resolution', 'consistent hashing', 'bloom filter'],
  },
  {
    id: 'bloom_filter',
    label: 'bloom filter',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    keywords: ['bloom filter', 'probabilistic', 'false positive', 'membership test'],
    relatedConcepts: ['hash table', 'deduplication', 'caching'],
  },

  // AI / LLM Systems
  {
    id: 'rag',
    label: 'RAG (Retrieval-Augmented Generation)',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    keywords: ['rag', 'retrieval augmented', 'vector search', 'embedding retrieval'],
    relatedConcepts: ['vector database', 'chunking strategy', 'reranking', 'semantic search'],
  },
  {
    id: 'prompt_engineering',
    label: 'prompt engineering',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    keywords: ['prompt', 'system prompt', 'few shot', 'chain of thought', 'prompt template'],
    relatedConcepts: ['temperature', 'max tokens', 'token window'],
  },
  {
    id: 'vector_database',
    label: 'vector database',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    keywords: ['vector db', 'embedding', 'semantic search', 'pinecone', 'pgvector'],
    relatedConcepts: ['RAG', 'embedding model', 'similarity search'],
  },

  // Observability
  {
    id: 'distributed_tracing',
    label: 'distributed tracing',
    domain: TechnicalDomain.OBSERVABILITY,
    keywords: ['tracing', 'trace', 'span', 'jaeger', 'opentelemetry', 'trace id'],
    relatedConcepts: ['logging', 'metrics', 'correlation id', 'sampling'],
  },
  {
    id: 'structured_logging',
    label: 'structured logging',
    domain: TechnicalDomain.OBSERVABILITY,
    keywords: ['structured log', 'json log', 'log format', 'log level', 'log aggregation'],
    relatedConcepts: ['distributed tracing', 'metrics', 'log correlation'],
  },
  {
    id: 'metrics_monitoring',
    label: 'metrics and monitoring',
    domain: TechnicalDomain.OBSERVABILITY,
    keywords: ['metrics', 'monitoring', 'dashboard', 'alert', 'prometheus', 'grafana'],
    relatedConcepts: ['distributed tracing', 'logging', 'SLI', 'SLO'],
  },

  // Concurrency
  {
    id: 'mutex_lock',
    label: 'mutex / locking',
    domain: TechnicalDomain.CONCURRENCY,
    keywords: ['mutex', 'lock', 'deadlock', 'race condition', 'concurrent access'],
    relatedConcepts: ['optimistic locking', 'pessimistic locking', 'semaphore'],
  },
  {
    id: 'optimistic_locking',
    label: 'optimistic locking',
    domain: TechnicalDomain.CONCURRENCY,
    keywords: ['optimistic lock', 'version column', 'conflict detection', 'CAS'],
    relatedConcepts: ['pessimistic locking', 'retry on conflict', 'version number'],
  },
  {
    id: 'actor_model',
    label: 'actor model',
    domain: TechnicalDomain.CONCURRENCY,
    keywords: ['actor', 'actor model', 'message passing', 'akka', 'elixir'],
    relatedConcepts: ['event-driven', 'mailbox', 'supervision tree'],
  },

  // System Design
  {
    id: 'cap_theorem',
    label: 'CAP theorem',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    keywords: ['cap theorem', 'consistency availability partition', 'ap system', 'cp system'],
    relatedConcepts: ['eventual consistency', 'consensus', 'replication'],
  },
  {
    id: 'load_shedding',
    label: 'load shedding',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    keywords: ['load shed', 'shed load', 'capacity', 'overload', 'backpressure'],
    relatedConcepts: ['rate limiting', 'auto scaling', 'graceful degradation'],
  },
  {
    id: 'data_consistency',
    label: 'data consistency',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    keywords: ['consistency', 'read after write', 'stale read', 'consistency guarantee'],
    relatedConcepts: ['eventual consistency', 'strong consistency', 'transaction isolation'],
  },
];

export function findConceptsByKeywords(text: string): ConceptEntry[] {
  const normalizedText = text.toLowerCase();
  return TECHNICAL_CONCEPT_CATALOG.filter((concept) =>
    concept.keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase()))
  );
}

export function findConceptsByDomain(domain: TechnicalDomain): ConceptEntry[] {
  return TECHNICAL_CONCEPT_CATALOG.filter((c) => c.domain === domain);
}

export function findRelatedConcepts(conceptId: string): ConceptEntry[] {
  const concept = TECHNICAL_CONCEPT_CATALOG.find((c) => c.id === conceptId);
  if (!concept) return [];
  return TECHNICAL_CONCEPT_CATALOG.filter(
    (c) => concept.relatedConcepts.includes(c.label) || concept.relatedConcepts.includes(c.id)
  );
}
