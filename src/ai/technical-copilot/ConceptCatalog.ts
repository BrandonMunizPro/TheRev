import { ConceptEntry, TechnicalDomain, TopicDefinition } from './types';

export const TECHNICAL_CONCEPT_CATALOG: ConceptEntry[] = [
  // Distributed Systems
  {
    id: 'idempotency',
    label: 'idempotency',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'duplicate_processing',
    keywords: ['duplicate', 'retry', 'idempotent', 'replay', 'same request twice'],
    relatedConcepts: ['idempotency key', 'deduplication store', 'at-least-once delivery', 'transactional boundary'],
  },
  {
    id: 'idempotency_key',
    label: 'idempotency key',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'duplicate_processing',
    keywords: ['idempotency key', 'unique key', 'request key', 'dedup key'],
    relatedConcepts: ['idempotency', 'deduplication store', 'idempotent API'],
  },
  {
    id: 'deduplication_store',
    label: 'deduplication store',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'duplicate_processing',
    keywords: ['dedup', 'deduplication', 'duplicate detection', 'seen requests'],
    relatedConcepts: ['idempotency', 'idempotency key', 'bloom filter'],
  },
  {
    id: 'at_least_once_delivery',
    label: 'at-least-once delivery',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'duplicate_processing',
    keywords: ['at least once', 'at-least-once', 'reliable delivery', 'message redelivery', 'consumer retry'],
    relatedConcepts: ['idempotency', 'dead letter queue', 'message acknowledgment'],
  },
  {
    id: 'transactional_boundary',
    label: 'transactional boundary',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'duplicate_processing',
    keywords: ['transactional boundary', 'database transaction', 'atomic write', 'transactional outbox', 'commit'],
    relatedConcepts: ['idempotency', 'idempotency key', 'transactional outbox'],
  },
  {
    id: 'exactly_once_semantics',
    label: 'exactly-once semantics',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'duplicate_processing',
    keywords: ['exactly once', 'exactly-once', 'no duplication', 'precisely once'],
    relatedConcepts: ['idempotency', 'transactional outbox', 'two-phase commit'],
  },
  {
    id: 'service_discovery',
    label: 'service discovery',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'service_discovery',
    keywords: ['service discovery', 'service registry', 'find services', 'locate service'],
    relatedConcepts: ['load balancer', 'health check', 'DNS-based discovery'],
  },
  {
    id: 'eventual_consistency',
    label: 'eventual consistency',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'eventual_consistency',
    keywords: ['eventual consistency', 'consistency model', 'replication lag', 'converge'],
    relatedConcepts: ['CAP theorem', 'conflict resolution', 'vector clock'],
  },
  {
    id: 'saga_pattern',
    label: 'saga pattern',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    topic: 'distributed_transactions',
    keywords: ['saga', 'distributed transaction', 'compensating transaction', 'choreography'],
    relatedConcepts: ['two-phase commit', 'eventual consistency', 'compensating action'],
  },

  // API Design
  {
    id: 'rate_limiting',
    label: 'rate limiting',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['rate limit', 'rate limiter', 'rate limiting', 'throttle', 'too many requests', '429', 'request limiting', 'quota'],
    relatedConcepts: ['token bucket', 'sliding window', 'backoff strategy', 'provider rate limits'],
  },
  {
    id: 'token_bucket',
    label: 'token bucket',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['token bucket', 'bucket algorithm', 'bursts', 'allow bursts'],
    relatedConcepts: ['rate limiting', 'leaky bucket', 'burst tolerance'],
  },
  {
    id: 'leaky_bucket',
    label: 'leaky bucket',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['leaky bucket', 'smooth output', 'uniform rate', 'constant rate'],
    relatedConcepts: ['rate limiting', 'token bucket', 'smoothing'],
  },
  {
    id: 'sliding_window',
    label: 'sliding window',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['sliding window', 'sliding window counter', 'rolling window', 'continuous window'],
    relatedConcepts: ['rate limiting', 'fixed window', 'per-client quota'],
  },
  {
    id: 'fixed_window',
    label: 'fixed window',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['fixed window', 'fixed time window', 'fixed window counter', 'resets every'],
    relatedConcepts: ['rate limiting', 'sliding window', 'simplest rate limiter'],
  },
  {
    id: 'distributed_counter',
    label: 'Redis / atomic counter',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['redis', 'atomic counter', 'increment counter', 'shared counter', 'in-memory counter'],
    relatedConcepts: ['rate limiting', 'per-client quota', 'distributed systems'],
  },
  {
    id: 'per_client_quota',
    label: 'per-client / per-key quota',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'rate_limiting',
    keywords: ['per client', 'per key', 'per user', 'per tenant', 'quota per', 'client quota', 'fairness'],
    relatedConcepts: ['rate limiting', 'sliding window', 'distributed counter'],
  },
  {
    id: 'pagination',
    label: 'pagination',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['pagination', 'paginate', 'paging'],
    relatedConcepts: ['cursor-based pagination', 'offset pagination', 'keyset pagination', 'stable sort key', 'next cursor', 'page size'],
  },
  {
    id: 'cursor_pagination',
    label: 'cursor-based pagination',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['cursor based', 'cursor-based', 'cursor pagination', 'next cursor', 'opaque cursor', 'base64 cursor', 'keyset pagination', 'keyset', 'seek method'],
    relatedConcepts: ['pagination', 'stable sort key', 'indexing for pagination', 'snapshot consistency', 'latest first'],
  },
  {
    id: 'offset_pagination',
    label: 'offset pagination',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['offset based', 'offset-based', 'offset pagination', 'page number', 'page parameter', 'limit offset', 'skip take'],
    relatedConcepts: ['pagination', 'cursor-based pagination', 'deep offset cost', 'stale data'],
  },
  {
    id: 'stable_sort_key',
    label: 'stable sort key',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['stable sort', 'sort key', 'secondary sort', 'unique ordering', 'deterministic order', 'stable order'],
    relatedConcepts: ['cursor-based pagination', 'indexing for pagination', 'next cursor'],
  },
  {
    id: 'page_size',
    label: 'page size',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['page size', 'default page size', 'max page size', 'per page', 'items per page', 'limit parameter'],
    relatedConcepts: ['pagination', 'offset pagination', 'cursor-based pagination'],
  },
  {
    id: 'next_cursor',
    label: 'next cursor / next page link',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['next page', 'next cursor', 'next token', 'next link', 'continue token', 'continuation token', 'resolve next page'],
    relatedConcepts: ['cursor-based pagination', 'pagination', 'snapshot consistency'],
  },
  {
    id: 'indexing_for_pagination',
    label: 'indexing for pagination',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'pagination',
    keywords: ['index for pagination', 'paginated query', 'indexing pagination', 'efficient pagination', 'cursor lookup index'],
    relatedConcepts: ['cursor-based pagination', 'query performance', 'stable sort key'],
  },
  {
    id: 'pagination_consistency',
    label: 'pagination consistency',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination_consistency',
    keywords: ['pagination consistency', 'consistent pagination', 'pagination snapshot', 'stable pagination', 'consistent cursor'],
    relatedConcepts: ['snapshot consistency', 'cursor-based pagination', 'next cursor', 'duplicate rows'],
  },
  {
    id: 'snapshot_consistency',
    label: 'snapshot consistency',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination_consistency',
    keywords: ['snapshot', 'snapshot consistency', 'pagination snapshot', 'point in time view', 'consistent read'],
    relatedConcepts: ['pagination consistency', 'next cursor', 'replication lag'],
  },
  {
    id: 'deep_offset_cost',
    label: 'deep offset cost',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'pagination',
    keywords: ['deep offset', 'high offset', 'large offset', 'offset cost', 'skip many rows', 'offset slow'],
    relatedConcepts: ['offset pagination', 'cursor-based pagination', 'query performance'],
  },
  {
    id: 'total_count_tradeoff',
    label: 'total-count tradeoff',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'pagination',
    keywords: ['total count', 'exact count', 'count on every page', 'count query', 'how many results', 'total number of results', 'count(*)'],
    relatedConcepts: ['offset pagination', 'cursor-based pagination', 'query performance', 'caching'],
  },
  {
    id: 'api_versioning',
    label: 'API versioning',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'api_versioning',
    keywords: ['api version', 'versioning', 'backward compatibility', 'breaking change'],
    relatedConcepts: ['header versioning', 'URL versioning', 'content negotiation'],
  },
  {
    id: 'hateoas',
    label: 'HATEOAS',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'hateoas',
    keywords: ['hateoas', 'hypermedia', 'hyperlink', 'resource links'],
    relatedConcepts: ['REST maturity model', 'content negotiation', 'link relations'],
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    domain: TechnicalDomain.API_DESIGN,
    topic: 'graphql',
    keywords: ['graphql', 'mutation', 'subscription', 'query', 'resolver', 'schema'],
    relatedConcepts: ['N+1 problem', 'data loader', 'schema stitching', 'federation'],
  },

  // Caching
  {
    id: 'cache_invalidation',
    label: 'cache invalidation',
    domain: TechnicalDomain.CACHING,
    topic: 'cache_invalidation',
    keywords: ['cache invalidation', 'stale cache', 'invalidate', 'cache bust'],
    relatedConcepts: ['TTL', 'cache-aside', 'write-through', 'cache coherence'],
  },
  {
    id: 'cache_aside',
    label: 'cache-aside pattern',
    domain: TechnicalDomain.CACHING,
    topic: 'cache_strategies',
    keywords: ['cache aside', 'lazy loading', 'read-through', 'check cache first'],
    relatedConcepts: ['write-through', 'write-behind', 'cache invalidation'],
  },
  {
    id: 'write_through',
    label: 'write-through cache',
    domain: TechnicalDomain.CACHING,
    topic: 'cache_strategies',
    keywords: ['write through', 'write-through', 'synchronous write', 'cache write'],
    relatedConcepts: ['write-behind', 'cache-aside', 'consistency'],
  },
  {
    id: 'memcached',
    label: 'Memcached / Redis caching',
    domain: TechnicalDomain.CACHING,
    topic: 'distributed_cache',
    keywords: ['memcached', 'redis cache', 'distributed cache', 'in-memory cache'],
    relatedConcepts: ['cache eviction', 'consistent hashing', 'cache clustering'],
  },
  {
    id: 'cdn_caching',
    label: 'CDN caching',
    domain: TechnicalDomain.CACHING,
    topic: 'cache_strategies',
    keywords: ['cdn', 'edge cache', 'content delivery', 'static asset cache'],
    relatedConcepts: ['cache invalidation', 'cache headers', 'origin shield'],
  },

  // Databases / SQL
  {
    id: 'database_indexing',
    label: 'database indexing',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'query_performance',
    keywords: ['index', 'slow query', 'query performance', 'b-tree', 'composite index'],
    relatedConcepts: ['query plan', 'covering index', 'index scan', 'table scan'],
  },
  {
    id: 'query_plan',
    label: 'query plan optimization',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'query_performance',
    keywords: ['query plan', 'explain', 'execution plan', 'slow query'],
    relatedConcepts: ['index', 'join optimization', 'statistics', 'cost-based optimizer'],
  },
  {
    id: 'materialized_view',
    label: 'materialized view',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'query_performance',
    keywords: ['materialized view', 'precomputed', 'precompute', 'aggregate table'],
    relatedConcepts: ['query performance', 'denormalization', 'refresh strategy'],
  },
  {
    id: 'partitioning',
    label: 'table partitioning',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'query_performance',
    keywords: ['table partitioning', 'partition table', 'range partition', 'list partition', 'partitioning'],
    relatedConcepts: ['query performance', 'sharding', 'partition pruning'],
  },
  {
    id: 'connection_pooling',
    label: 'connection pooling',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'database_scaling',
    keywords: ['connection pool', 'pool exhaustion', 'too many connections', 'PgBouncer'],
    relatedConcepts: ['connection limit', 'pool sizing', 'idle timeout'],
  },
  {
    id: 'database_migration',
    label: 'database migration',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'database_migration',
    keywords: ['migration', 'schema change', 'alter table', 'data migration'],
    relatedConcepts: ['blue-green deployment', 'backward compatible migration', 'expand-contract'],
  },
  {
    id: 'sharding',
    label: 'database sharding',
    domain: TechnicalDomain.DATABASES_SQL,
    topic: 'database_scaling',
    keywords: ['shard', 'sharding', 'horizontal partition', 'partition key'],
    relatedConcepts: ['cross-shard query', 'rebalancing', 'consistent hashing'],
  },

  // Messaging / Queues
  {
    id: 'dead_letter_queue',
    label: 'dead letter queue',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    topic: 'queue_reliability',
    keywords: ['dead letter', 'DLQ', 'poison message', 'failed message'],
    relatedConcepts: ['retry policy', 'message acknowledgment', 'circuit breaker'],
  },
  {
    id: 'message_broker',
    label: 'message broker',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    topic: 'streaming',
    keywords: ['message broker', 'kafka', 'rabbitmq', 'sqs', 'pub sub'],
    relatedConcepts: ['consumer group', 'partition', 'message ordering', 'backpressure'],
  },
  {
    id: 'pub_sub',
    label: 'publish-subscribe',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    topic: 'streaming',
    keywords: ['pub sub', 'publish subscribe', 'topic', 'broadcast', 'fan out'],
    relatedConcepts: ['message broker', 'event-driven', 'WebSocket'],
  },
  {
    id: 'event_sourcing',
    label: 'event sourcing',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    topic: 'event_driven',
    keywords: ['event source', 'event store', 'event log', 'append-only log'],
    relatedConcepts: ['CQRS', 'projection', 'replay events', 'snapshot'],
  },

  // Reliability / Fault Tolerance
  {
    id: 'circuit_breaker',
    label: 'circuit breaker',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['circuit breaker', 'circuit break', 'provider unavailable', 'cascade failure', 'open circuit', 'unavailable', 'outage'],
    relatedConcepts: ['exponential backoff', 'retry policy', 'bulkhead', 'fallback'],
  },
  {
    id: 'exponential_backoff',
    label: 'exponential backoff',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['exponential backoff', 'backoff', 'retry delay', 'jitter', 'retry strategy'],
    relatedConcepts: ['circuit breaker', 'retry budget', 'jitter', 'backoff strategy'],
  },
  {
    id: 'retry_policy',
    label: 'retry policy',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['retry', 'retries', 'retry policy', 'retry count', 'should retry'],
    relatedConcepts: ['exponential backoff', 'retry budget', 'circuit breaker'],
  },
  {
    id: 'health_check',
    label: 'health check',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['health check', 'health probe', 'liveness', 'readiness', 'is healthy'],
    relatedConcepts: ['circuit breaker', 'load balancer', 'graceful degradation'],
  },
  {
    id: 'graceful_degradation',
    label: 'graceful degradation',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['degradation', 'graceful', 'fallback', 'reduced functionality', 'partial failure', 'stable', 'degrade'],
    relatedConcepts: ['circuit breaker', 'fallback', 'bulkhead', 'feature flag'],
  },
  {
    id: 'recovery_queue',
    label: 'recovery queue / DLQ',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['recovery queue', 'dlq', 'dead letter', 'requeue', 'retry queue', 'poison messages'],
    relatedConcepts: ['circuit breaker', 'dead letter queue', 'exponential backoff'],
  },
  {
    id: 'bulkhead',
    label: 'bulkhead pattern',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['bulkhead', 'isolation', 'resource isolation', 'failure isolation'],
    relatedConcepts: ['circuit breaker', 'thread pool isolation', 'connection pool isolation'],
  },
  {
    id: 'timeout_budget',
    label: 'timeout budget',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'provider_failure',
    keywords: ['timeout budget', 'per request timeout', 'max timeout', 'deadline', 'allotted time', 'request deadline'],
    relatedConcepts: ['circuit breaker', 'retry policy', 'bulkhead', 'graceful degradation'],
  },
  {
    id: 'chaos_engineering',
    label: 'chaos engineering',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    topic: 'resilience_testing',
    keywords: ['chaos', 'fault injection', 'game day', 'resilience testing'],
    relatedConcepts: ['circuit breaker', 'bulkhead', 'failure mode'],
  },

  // Auth / Authorization
  {
    id: 'jwt',
    label: 'JWT tokens',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    topic: 'token_management',
    keywords: ['jwt', 'json web token', 'token refresh', 'access token', 'refresh token'],
    relatedConcepts: ['token rotation', 'token revocation', 'OAuth', 'session management'],
  },
  {
    id: 'oauth',
    label: 'OAuth 2.0',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    topic: 'oauth',
    keywords: ['oauth', 'authorization code', 'client credentials', 'token exchange'],
    relatedConcepts: ['JWT', 'OpenID Connect', 'PKCE', 'scope'],
  },
  {
    id: 'rbac',
    label: 'role-based access control',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    topic: 'access_control',
    keywords: ['rbac', 'role', 'permission', 'authorization', 'access control'],
    relatedConcepts: ['ABAC', 'capability', 'policy engine', 'least privilege'],
  },
  {
    id: 'capability_model',
    label: 'capability-based access',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    topic: 'access_control',
    keywords: ['capability', 'entitlement', 'feature flag', 'access grant'],
    relatedConcepts: ['RBAC', 'ABAC', 'permission', 'authorization middleware'],
  },

  // Cloud / Infrastructure
  {
    id: 'auto_scaling',
    label: 'auto-scaling',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    topic: 'scalability',
    keywords: ['auto scale', 'autoscaling', 'scale out', 'scale up', 'horizontal scaling'],
    relatedConcepts: ['load balancer', 'instance pool', 'scaling policy', 'cool down'],
  },
  {
    id: 'load_balancer',
    label: 'load balancer',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    topic: 'scalability',
    keywords: ['load balancer', 'traffic distribution', 'round robin', 'least connections', 'traffic'],
    relatedConcepts: ['health check', 'sticky session', 'TLS termination', 'auto scaling'],
  },
  {
    id: 'container_orchestration',
    label: 'container orchestration',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    topic: 'container_orchestration',
    keywords: ['kubernetes', 'k8s', 'container', 'pod', 'deployment', 'docker'],
    relatedConcepts: ['service mesh', 'sidecar', 'rolling update', 'configmap'],
  },
  {
    id: 'infrastructure_as_code',
    label: 'infrastructure as code',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    topic: 'infrastructure_provisioning',
    keywords: ['terraform', 'infrastructure as code', 'iac', 'cloudformation', 'pulumi'],
    relatedConcepts: ['state management', 'drift detection', 'module', 'plan'],
  },

  // DevOps / CI/CD
  {
    id: 'ci_cd_pipeline',
    label: 'CI/CD pipeline',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'pipeline',
    keywords: ['ci/cd', 'pipeline', 'build', 'deploy', 'continuous integration', 'continuous deployment'],
    relatedConcepts: ['blue-green deployment', 'canary release', 'feature flag', 'rollback'],
  },
  {
    id: 'blue_green_deployment',
    label: 'blue-green deployment',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'deployment_strategies',
    keywords: ['blue green', 'blue-green', 'zero downtime', 'swap traffic'],
    relatedConcepts: ['canary release', 'rolling update', 'rollback'],
  },
  {
    id: 'canary_release',
    label: 'canary release',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'deployment_strategies',
    keywords: ['canary', 'gradual rollout', 'percent rollout', 'feature flag rollout'],
    relatedConcepts: ['blue-green deployment', 'A/B testing', 'feature flag'],
  },
  {
    id: 'expand_contract_migration',
    label: 'expand-contract migration',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'zero_downtime_migration',
    keywords: ['expand contract', 'expand/contract', 'expand contract migration', 'backwards compatible', 'backward compatible', 'additive migration', 'additive schema change'],
    relatedConcepts: ['dual write & backfill', 'reversible migration', 'blue-green deployment', 'feature flag'],
  },
  {
    id: 'dual_write_backfill',
    label: 'dual write & backfill',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'zero_downtime_migration',
    keywords: ['dual write', 'dual writes', 'write to both', 'write both', 'backfill', 'backfill script', 'backfill old data', 'backfill the table'],
    relatedConcepts: ['expand-contract migration', 'reversible migration', 'cutover strategy'],
  },
  {
    id: 'reversible_migration',
    label: 'reversible migration',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'zero_downtime_migration',
    keywords: ['reversible', 'rollback migration', 'revert change', 'revertible', 'can we undo', 'undo migration', 'roll forward'],
    relatedConcepts: ['feature flag', 'expand-contract migration', 'blue-green deployment'],
  },
  {
    id: 'cutover_strategy',
    label: 'cutover strategy',
    domain: TechnicalDomain.DEVOPS_CICD,
    topic: 'zero_downtime_migration',
    keywords: ['cutover', 'switch traffic', 'flip traffic', 'point the app', 'redirect traffic', 'switch reads', 'switch writes', 'go live migration'],
    relatedConcepts: ['blue-green deployment', 'dual write & backfill', 'reversible migration', 'feature flag'],
  },

  // OOP / Design
  {
    id: 'solid_principles',
    label: 'SOLID principles',
    domain: TechnicalDomain.OOP_DESIGN,
    topic: 'principles',
    keywords: ['solid', 'single responsibility', 'open closed', 'dependency inversion', 'interface segregation'],
    relatedConcepts: ['design patterns', 'composition over inheritance', 'dependency injection'],
  },
  {
    id: 'design_patterns',
    label: 'design patterns',
    domain: TechnicalDomain.OOP_DESIGN,
    topic: 'patterns',
    keywords: ['design pattern', 'factory', 'strategy', 'observer', 'decorator', 'adapter pattern'],
    relatedConcepts: ['SOLID', 'composition', 'interface'],
  },
  {
    id: 'strategy_pattern',
    label: 'strategy pattern',
    domain: TechnicalDomain.OOP_DESIGN,
    topic: 'patterns',
    keywords: ['strategy', 'swap algorithm', 'plug algorithm', 'interchangeable'],
    relatedConcepts: ['adapter pattern', 'dependency injection', 'composition'],
  },

  // Algorithms / Data Structures
  {
    id: 'binary_search',
    label: 'binary search',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    topic: 'search_membership',
    keywords: ['binary search', 'log n', 'sorted search', 'divide and conquer'],
    relatedConcepts: ['search algorithm', 'sorted array', 'bisect'],
  },
  {
    id: 'hash_table',
    label: 'hash table',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    topic: 'search_membership',
    keywords: ['hash', 'hashmap', 'hash table', 'dictionary', 'o(1) lookup'],
    relatedConcepts: ['collision resolution', 'consistent hashing', 'bloom filter'],
  },
  {
    id: 'bloom_filter',
    label: 'bloom filter',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    topic: 'search_membership',
    keywords: ['bloom filter', 'probabilistic', 'false positive', 'membership test'],
    relatedConcepts: ['hash table', 'deduplication', 'caching'],
  },

  // AI / LLM Systems
  {
    id: 'rag',
    label: 'RAG (Retrieval-Augmented Generation)',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    topic: 'rag',
    keywords: ['rag', 'retrieval augmented', 'vector search', 'embedding retrieval'],
    relatedConcepts: ['vector database', 'chunking strategy', 'reranking', 'semantic search'],
  },
  {
    id: 'prompt_engineering',
    label: 'prompt engineering',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    topic: 'prompt_engineering',
    keywords: ['prompt', 'system prompt', 'few shot', 'chain of thought', 'prompt template'],
    relatedConcepts: ['temperature', 'max tokens', 'token window'],
  },
  {
    id: 'vector_database',
    label: 'vector database',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    topic: 'rag',
    keywords: ['vector db', 'embedding', 'semantic search', 'pinecone', 'pgvector'],
    relatedConcepts: ['RAG', 'embedding model', 'similarity search'],
  },

  // Observability
  {
    id: 'distributed_tracing',
    label: 'distributed tracing',
    domain: TechnicalDomain.OBSERVABILITY,
    topic: 'tracing',
    keywords: ['tracing', 'trace', 'span', 'jaeger', 'opentelemetry', 'trace id'],
    relatedConcepts: ['logging', 'metrics', 'correlation id', 'sampling'],
  },
  {
    id: 'structured_logging',
    label: 'structured logging',
    domain: TechnicalDomain.OBSERVABILITY,
    topic: 'logging',
    keywords: ['structured log', 'json log', 'log format', 'log level', 'log aggregation'],
    relatedConcepts: ['distributed tracing', 'metrics', 'log correlation'],
  },
  {
    id: 'metrics_monitoring',
    label: 'metrics and monitoring',
    domain: TechnicalDomain.OBSERVABILITY,
    topic: 'metrics',
    keywords: ['metrics', 'monitoring', 'dashboard', 'alert', 'prometheus', 'grafana'],
    relatedConcepts: ['distributed tracing', 'logging', 'SLI', 'SLO'],
  },

  // Concurrency
  {
    id: 'mutex_lock',
    label: 'mutex / locking',
    domain: TechnicalDomain.CONCURRENCY,
    topic: 'locking_synchronization',
    keywords: ['mutex', 'lock', 'deadlock', 'race condition', 'concurrent access'],
    relatedConcepts: ['optimistic locking', 'pessimistic locking', 'semaphore'],
  },
  {
    id: 'optimistic_locking',
    label: 'optimistic locking',
    domain: TechnicalDomain.CONCURRENCY,
    topic: 'optimistic_concurrency',
    keywords: ['optimistic lock', 'version column', 'conflict detection', 'CAS'],
    relatedConcepts: ['pessimistic locking', 'retry on conflict', 'version number'],
  },
  {
    id: 'actor_model',
    label: 'actor model',
    domain: TechnicalDomain.CONCURRENCY,
    topic: 'actor_models',
    keywords: ['actor', 'actor model', 'message passing', 'akka', 'elixir'],
    relatedConcepts: ['event-driven', 'mailbox', 'supervision tree'],
  },

  // System Design
  {
    id: 'cap_theorem',
    label: 'CAP theorem',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    topic: 'consistency_models',
    keywords: ['cap theorem', 'consistency availability partition', 'ap system', 'cp system'],
    relatedConcepts: ['eventual consistency', 'consensus', 'replication'],
  },
  {
    id: 'load_shedding',
    label: 'load shedding',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    topic: 'load_management',
    keywords: ['load shed', 'shed load', 'capacity', 'overload', 'backpressure'],
    relatedConcepts: ['rate limiting', 'auto scaling', 'graceful degradation'],
  },
  {
    id: 'request_queuing',
    label: 'request queue / buffering',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    topic: 'overload_protection',
    keywords: ['queue requests', 'buffer requests', 'request queue', 'hold requests', 'queue up', 'defer work', 'push to a queue', 'return a ticket'],
    relatedConcepts: ['backpressure', 'load shedding', 'rate limiting', 'graceful degradation'],
  },
  {
    id: 'reject_under_overload',
    label: 'reject under overload (fail fast)',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    topic: 'overload_protection',
    keywords: ['reject requests', 'reject new requests', 'fail fast', 'too many to handle', 'drop the request', 'busy response', '503 under load', 'stop accepting', 'close the gate'],
    relatedConcepts: ['load shedding', 'request queue / buffering', 'rate limiting', 'graceful degradation'],
  },
  {
    id: 'cache_absorb_spike',
    label: 'cache-heavy reads for spikes',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    topic: 'overload_protection',
    keywords: ['cache the results', 'cache the response', 'serve from cache', 'cache hits', 'read from cache', 'absorb the spike', 'rate of requests is going to increase', 'spike in reads'],
    relatedConcepts: ['cache strategies', 'rate limiting', 'auto-scaling', 'load shedding'],
  },
  {
    id: 'data_consistency',
    label: 'data consistency',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    topic: 'consistency_models',
    keywords: ['consistency', 'read after write', 'stale read', 'consistency guarantee'],
    relatedConcepts: ['eventual consistency', 'strong consistency', 'transaction isolation'],
  },
];

export const TOPIC_CATALOG: TopicDefinition[] = [
  // API Design
  {
    id: 'rate_limiting',
    domain: TechnicalDomain.API_DESIGN,
    label: 'rate limiting',
    keywords: ['rate limit', 'rate limiter', 'rate limiting', 'throttle', 'quota', '429', 'too many requests', 'requests per second', 'burst', 'fairness', 'simplicity', 'request limiting'],
  },
  {
    id: 'pagination',
    domain: TechnicalDomain.API_DESIGN,
    label: 'pagination',
    keywords: ['pagination', 'page size', 'offset', 'cursor', 'paginate', 'paging', 'next page', 'next cursor', 'per page', 'items per page', 'load more', 'infinite scroll'],
  },
  {
    id: 'pagination_consistency',
    domain: TechnicalDomain.API_DESIGN,
    label: 'pagination consistency',
    keywords: ['pagination consistency', 'consistent pagination', 'pagination snapshot', 'snapshot consistency', 'consistent data across pages', 'stable data while paging', 'new items shift', 'duplicates while paging', 'skip items while paging', 'items shift between pages'],
  },
  {
    id: 'api_versioning',
    domain: TechnicalDomain.API_DESIGN,
    label: 'API versioning',
    keywords: ['api version', 'versioning', 'backward compatibility', 'breaking change'],
  },
  {
    id: 'hateoas',
    domain: TechnicalDomain.API_DESIGN,
    label: 'HATEOAS',
    keywords: ['hateoas', 'hypermedia', 'link relations', 'rest maturity'],
  },
  {
    id: 'graphql',
    domain: TechnicalDomain.API_DESIGN,
    label: 'GraphQL',
    keywords: ['graphql', 'mutation', 'subscription', 'schema', 'resolver'],
  },

  // Distributed Systems
  {
    id: 'duplicate_processing',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    label: 'duplicate processing',
    keywords: ['duplicate', 'duplicated', 'duplication', 'duplicating', 'idempotent', 'idempotency', 'at least once', 'at-least-once', 'at most once', 'redelivery', 'redeliver', 'replay', 'replayed', 'same request', 'same message', 'dedup', 'deduplication', 'prevent duplicate', 'processed twice', 'process twice'],
  },
  {
    id: 'service_discovery',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    label: 'service discovery',
    keywords: ['service discovery', 'service registry', 'locate services'],
  },
  {
    id: 'eventual_consistency',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    label: 'eventual consistency',
    keywords: ['eventual consistency', 'replication lag', 'converge', 'consistency model'],
  },
  {
    id: 'distributed_transactions',
    domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
    label: 'distributed transactions',
    keywords: ['saga', 'distributed transaction', 'compensating transaction', 'compensation'],
  },

  // Caching
  {
    id: 'cache_strategies',
    domain: TechnicalDomain.CACHING,
    label: 'cache strategies',
    keywords: ['cache aside', 'read through', 'write through', 'write behind', 'lazy load', 'caching strategy', 'where to cache', 'cache layer'],
  },
  {
    id: 'cache_invalidation',
    domain: TechnicalDomain.CACHING,
    label: 'cache invalidation',
    keywords: ['invalidate', 'stale cache', 'cache bust', 'ttl', 'cache expiry', 'out of date', 'cache coherence'],
  },
  {
    id: 'distributed_cache',
    domain: TechnicalDomain.CACHING,
    label: 'distributed cache',
    keywords: ['redis', 'memcached', 'distributed cache', 'cache cluster', 'consistent hashing', 'cache eviction'],
  },

  // Databases
  {
    id: 'query_performance',
    domain: TechnicalDomain.DATABASES_SQL,
    label: 'query performance',
    keywords: ['slow query', 'slow request', 'query performance', 'query plan', 'explain', 'missing index', 'index scan', 'table scan', 'database slow', 'sql slow', 'slowing down', 'getting slower', 'performance tuning', 'query optimization', 'optimize the query'],
  },
  {
    id: 'database_scaling',
    domain: TechnicalDomain.DATABASES_SQL,
    label: 'database scaling',
    keywords: ['shard', 'sharding', 'partition key', 'read replica', 'replication', 'scale the database', 'too many connections', 'connection pool'],
  },
  {
    id: 'database_migration',
    domain: TechnicalDomain.DATABASES_SQL,
    label: 'database migration',
    keywords: ['migration', 'schema change', 'alter table', 'expand-contract', 'data migration'],
  },

  // Messaging / Queues
  {
    id: 'queue_reliability',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    label: 'queue reliability',
    keywords: ['dead letter', 'dlq', 'poison message', 'failed message', 'retry queue', 'acknowledgment', 'message ack', 'requeue', 'message consumer'],
  },
  {
    id: 'streaming',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    label: 'streaming / brokers',
    keywords: ['kafka', 'rabbitmq', 'sqs', 'message broker', 'consumer group', 'partition offset', 'stream processing', 'pub sub'],
  },
  {
    id: 'event_driven',
    domain: TechnicalDomain.MESSAGING_QUEUES,
    label: 'event-driven',
    keywords: ['event sourcing', 'event store', 'event-driven', 'event log', 'cqrs', 'event stream'],
  },

  // Reliability / Fault Tolerance
  {
    id: 'provider_failure',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    label: 'provider failure',
    keywords: ['provider unavailable', 'provider down', 'provider fails', 'external service', 'external provider', 'third party', 'third-party', 'dependency goes down', 'becomes unavailable', 'becomes unreliable', 'unreliable', 'outage', 'goes down', 'keep the system stable', 'system stable', 'stability', 'service down', 'dependent', 'cascading', 'failures', 'failing', 'recover', 'resilient', 'resilience'],
  },
  {
    id: 'resilience_testing',
    domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
    label: 'resilience testing',
    keywords: ['chaos', 'fault injection', 'game day', 'resilience testing', 'failure drills'],
  },

  // Auth
  {
    id: 'token_management',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    label: 'token management',
    keywords: ['jwt', 'token refresh', 'refresh token', 'access token', 'revoke token', 'rotate token', 'token expiry'],
  },
  {
    id: 'oauth',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    label: 'OAuth',
    keywords: ['oauth', 'authorization code', 'client credentials', 'pkce', 'openid', 'token exchange'],
  },
  {
    id: 'access_control',
    domain: TechnicalDomain.AUTH_AUTHORIZATION,
    label: 'access control',
    keywords: ['rbac', 'role-based', 'permission', 'authorization', 'access control', 'capability', 'least privilege'],
  },

  // Cloud / Infrastructure
  {
    id: 'scalability',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    label: 'scalability',
    keywords: ['auto scale', 'autoscaling', 'scale out', 'scale up', 'horizontal scaling', 'traffic grows', 'traffic increasing', 'traffic high', 'growing traffic', 'handle more traffic', 'load balancer', 'more users', 'high volume', 'high traffic', 'requests per second'],
  },
  {
    id: 'container_orchestration',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    label: 'container orchestration',
    keywords: ['kubernetes', 'k8s', 'container', 'pod', 'docker', 'orchestration', 'deployment targets'],
  },
  {
    id: 'infrastructure_provisioning',
    domain: TechnicalDomain.CLOUD_INFRASTRUCTURE,
    label: 'infrastructure as code',
    keywords: ['terraform', 'infrastructure as code', 'cloudformation', 'pulumi', 'provisioning'],
  },

  // DevOps
  {
    id: 'pipeline',
    domain: TechnicalDomain.DEVOPS_CICD,
    label: 'CI/CD pipeline',
    keywords: ['ci/cd', 'pipeline', 'build', 'continuous integration', 'continuous deployment'],
  },
  {
    id: 'deployment_strategies',
    domain: TechnicalDomain.DEVOPS_CICD,
    label: 'deployment strategies',
    keywords: ['blue green', 'blue-green', 'canary', 'rolling deploy', 'zero downtime', 'rollback', 'feature flag rollout', 'release'],
  },
  {
    id: 'zero_downtime_migration',
    domain: TechnicalDomain.DEVOPS_CICD,
    label: 'zero downtime migration',
    keywords: ['zero downtime', 'zero-downtime', 'zero down time', 'without downtime', 'no downtime', 'downtime during migration', 'migrate without downtime', 'migration without downtime', 'expand contract', 'expand/contract', 'dual write', 'backfill', 'cutover'],
  },

  // OOP / Design
  {
    id: 'principles',
    domain: TechnicalDomain.OOP_DESIGN,
    label: 'design principles',
    keywords: ['solid', 'single responsibility', 'open closed', 'dependency injection', 'dependency inversion', 'interface segregation', 'liskov'],
  },
  {
    id: 'patterns',
    domain: TechnicalDomain.OOP_DESIGN,
    label: 'design patterns',
    keywords: ['design pattern', 'factory', 'strategy pattern', 'observer', 'decorator', 'adapter', 'where to extend'],
  },

  // Algorithms / Data Structures
  {
    id: 'search_membership',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    label: 'search & membership',
    keywords: ['binary search', 'hash table', 'hashmap', 'bloom filter', 'search', 'lookup', 'membership'],
  },
  {
    id: 'complexity',
    domain: TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
    label: 'complexity analysis',
    keywords: ['time complexity', 'space complexity', 'big-o', 'big o', 'log n', 'performance of the algorithm', 'efficient algorithm'],
  },

  // AI / LLM
  {
    id: 'rag',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    label: 'RAG',
    keywords: ['rag', 'retrieval augmented', 'vector search', 'embedding', 'semantic search', 'knowledge base'],
  },
  {
    id: 'prompt_engineering',
    domain: TechnicalDomain.AI_LLM_SYSTEMS,
    label: 'prompt engineering',
    keywords: ['prompt', 'system prompt', 'few shot', 'chain of thought', 'context window', 'prompt template'],
  },

  // Observability
  {
    id: 'tracing',
    domain: TechnicalDomain.OBSERVABILITY,
    label: 'tracing',
    keywords: ['tracing', 'trace', 'span', 'correlation id', 'opentelemetry', 'jaeger'],
  },
  {
    id: 'logging',
    domain: TechnicalDomain.OBSERVABILITY,
    label: 'logging',
    keywords: ['log', 'logging', 'structured log', 'log level', 'log aggregation'],
  },
  {
    id: 'metrics',
    domain: TechnicalDomain.OBSERVABILITY,
    label: 'metrics & monitoring',
    keywords: ['metrics', 'monitoring', 'alerts', 'prometheus', 'grafana', 'dashboard', 'slo', 'sli'],
  },
  {
    id: 'investigate',
    domain: TechnicalDomain.OBSERVABILITY,
    label: 'investigation',
    keywords: ['investigate', 'investigation', 'diagnos', 'troubleshoot', 'root cause', 'find out why', 'figure out', 'what is causing', 'profiling'],
  },

  // Concurrency
  {
    id: 'locking_synchronization',
    domain: TechnicalDomain.CONCURRENCY,
    label: 'locking / synchronization',
    keywords: ['lock', 'mutex', 'deadlock', 'race condition', 'semaphore', 'synchroniz', 'thread safe', 'concurrent access'],
  },
  {
    id: 'optimistic_concurrency',
    domain: TechnicalDomain.CONCURRENCY,
    label: 'optimistic concurrency',
    keywords: ['optimistic lock', 'optimistic locking', 'cas', 'version column', 'conflict detection'],
  },
  {
    id: 'actor_models',
    domain: TechnicalDomain.CONCURRENCY,
    label: 'actor model',
    keywords: ['actor model', 'actors', 'message passing', 'mailbox'],
  },

  // System Design
  {
    id: 'consistency_models',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    label: 'consistency models',
    keywords: ['cap theorem', 'consistency model', 'strong consistency', 'availability vs consistency', 'replication'],
  },
  {
    id: 'load_management',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    label: 'load management',
    keywords: ['load shedding', 'overload', 'backpressure', 'too much load', 'capacity planning', 'high load'],
  },
  {
    id: 'overload_protection',
    domain: TechnicalDomain.SYSTEM_DESIGN,
    label: 'overload protection',
    keywords: ['traffic spike', 'spike in traffic', 'sudden increase in traffic', 'burst of traffic', 'flood of requests', 'overwhelmed', 'go from 100 to 10000', '10x traffic', 'rate of requests is going to increase', 'thousands of requests', 'can handle the load', 'handle the load', 'requests pour in'],
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

export function findConceptsByTopic(topicId: string): ConceptEntry[] {
  return TECHNICAL_CONCEPT_CATALOG.filter((c) => c.topic === topicId);
}

export function findConceptsByTopics(topicIds: string[]): ConceptEntry[] {
  const set = new Set(topicIds);
  return TECHNICAL_CONCEPT_CATALOG.filter((c) => set.has(c.topic));
}

export const STRONG_TOPIC_KEYWORDS: RegExp[] = [
  /\bidempoten\w*/i,
  /\bduplicate\w*\s+(processing|handling|requests?|messages?|events?)\b/i,
  /\bat[\s-]least[\s-]once/i,
  /\bexactly[\s-]once/i,
  /\bdead[\s-]letter/i,
  /\bcircuit[\s-]breaker/i,
  /\b(rate|request)\s+limit/i,
  /\b429\b/i,
  /\b(offset|cursor)[\s-]?pagination\b/i,
  /\bcursor[\s-]based/i,
  /\bkeyset/i,
  /\bnext[\s-]cursor/i,
  /\bnext[\s-]page\b/i,
  /\bpagination\s+(consisten|snapshot)/i,
  /\bslow\s+(query|request|response|endpoint)\b/i,
  /\bmemory[\s-]?leak/i,
  /\b(open|too\s+many)\s+connections\b/i,
  /\bconnection[\s-]pool/i,
  /\b(primary|unique)\s+(key|index)\b/i,
  /\bindex\s+scan/i,
  /\btable\s+scan/i,
  /\b(on\s+which\s+(side|server|service|client))|(which\s+(side|server|service|client))\b/i,
  /\b(each|every|one)\s+request\b/i,
];

export const WEAK_TOPIC_KEYWORDS: RegExp[] = [
  /\bduplicate\b/i,
  /\bretry\b/i,
  /\bmodel\b/i,
  /\btoken\b/i,
  /\bvector\b/i,
  /\bschema\b/i,
  /\bquery\b/i,
  /\b(paginat|page|pages|offset|cursor)\w*\b/i,
  /\b(throughput|latency)\b/i,
];

export function findTopicsByKeywords(
  text: string
): Array<{ topic: TopicDefinition; score: number; matchedKeywords: string[] }> {
  const normalizedText = text.toLowerCase();
  const results: Array<{ topic: TopicDefinition; score: number; matchedKeywords: string[] }> = [];

  for (const topic of TOPIC_CATALOG) {
    const matched: string[] = [];
    let score = 0;

    for (const keyword of topic.keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        matched.push(keyword);
        score = Math.max(score, 0.75);
        if (keyword.length >= 8) score = Math.max(score, 1.0);
        break;
      }
    }

    if (score === 0) {
      for (const weak of WEAK_TOPIC_KEYWORDS) {
        if (weak.test(normalizedText)) {
          matched.push(weak.source.replace(/\\b/g, '').replace(/\\/g, ''));
          score = Math.max(score, 0.4);
        }
      }
    }

    if (score > 0) {
      results.push({ topic, score, matchedKeywords: matched });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function findRelatedConcepts(conceptId: string): ConceptEntry[] {
  const concept = TECHNICAL_CONCEPT_CATALOG.find((c) => c.id === conceptId);
  if (!concept) return [];
  return TECHNICAL_CONCEPT_CATALOG.filter(
    (c) => concept.relatedConcepts.includes(c.label) || concept.relatedConcepts.includes(c.id)
  );
}