# TheRev — AI Avatar Social Media Platform

## What is it?

**TheRev (The Revolution)** is a privacy-first, AI-powered desktop social media platform. It combines an AI browsing companion with a 3D VRM avatar, voice control, local AI (Ollama), multi-provider AI support (OpenAI, Claude, Gemini, Perplexity), and a community platform with threads, servers, and friends.

> *"Browse the web with your privacy-first AI companion who reacts to content alongside you."*

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + TypeScript, Express, GraphQL Yoga, Type-GraphQL |
| **Database** | PostgreSQL 16 + TypeORM with horizontal sharding (4 shards) + read replicas |
| **Cache/Queue** | Redis (single instance + 3-node cluster), PgBouncer connection pool |
| **Frontend** | Electron desktop app with Three.js + three-vrm for 3D avatars |
| **AI** | Adapter pattern: Ollama (local), OpenAI, Claude, Gemini, Perplexity |
| **Browser** | Playwright automation server + WebView2 user browser |
| **Voice** | Web Speech API + Whisper STT (local), server.cjs STT server |

## Core Architecture

```
TheRev/
├── src/
│   ├── index.ts                 # Main Express server entry point
│   ├── worker.ts                # AI Task worker (Redis queue consumer)
│   ├── data-source.ts           # TypeORM DataSource config
│   │
│   ├── ai/                      # AI layer
│   │   ├── AIIntentClassifier.ts    # 700+ lines, classifies user intent
│   │   ├── WebsiteRouter.ts         # 30+ website navigation patterns
│   │   ├── OllamaRepairService.ts   # Auto-repair GPU corruption
│   │   ├── SmartFallbackService.ts  # Provider fallback routing
│   │   ├── AITaskManager.ts         # Task orchestration
│   │   ├── BrowserAgent.ts          # AI browser automation agent
│   │   ├── adapters/                # AIAdapter interface + 5 provider adapters
│   │   │   ├── AIAdapter.ts         # Common interface
│   │   │   ├── ChatGPTAdapter.ts
│   │   │   ├── ClaudeAdapter.ts
│   │   │   ├── GeminiAdapter.ts
│   │   │   ├── PerplexityAdapter.ts
│   │   │   ├── OllamaAdapter.ts
│   │   │   └── CircuitBreaker.ts
│   │   └── ... (rate limiter, audit, subscription services)
│   │
│   ├── browser/                  # Browser automation
│   │   ├── automation-server.cjs     # Playwright API server (/click, /type, /scroll)
│   │   ├── BrowserManager.ts         # Browser lifecycle management
│   │   ├── BrowserSandbox.ts         # Security sandbox
│   │   ├── BrowserAdapter.ts         # Browser abstraction
│   │   ├── AIBrowserService.ts       # AI-browser orchestration
│   │   ├── BrowserAIOrchestrator.ts  # AI-driven browser actions
│   │   ├── AutomationRunner.ts       # Task execution runner
│   │   └── BrowserResourceMonitor.ts # Resource tracking
│   │
│   ├── resolvers/                # 12 GraphQL resolvers
│   │   ├── Auth.ts, User.ts, Thread.ts, Post.ts
│   │   ├── Friend.ts, Server.ts, Message.ts
│   │   ├── ThreadVote.ts, ThreadPermissions.ts
│   │   ├── Notification.ts, Call.ts, System.ts
│   │
│   ├── entities/                 # 16 TypeORM entities
│   │   ├── User.ts, Thread.ts, Post.ts
│   │   ├── Server.ts, Channel.ts, ServerMember.ts
│   │   ├── Friend.ts, Message.ts, Call.ts
│   │   ├── ThreadVote.ts, ThreadAdmin.ts
│   │   ├── Notification.ts, NewsArticle.ts
│   │   ├── Task.ts, MigrationState.ts
│   │
│   ├── dao/                      # 9 data access objects
│   │   ├── users.dao.ts, threads.dao.ts, posts.dao.ts
│   │   ├── friends.dao.ts, messages.dao.ts
│   │   ├── notifications.dao.ts, threadAdmin.dao.ts
│   │   ├── threadVotes.dao.ts, serverMembers.dao.ts
│   │   └── sharding/              # Sharded DAOs
│   │       ├── BaseShardedDao.ts
│   │       ├── ShardedUsersDao.ts
│   │       ├── ShardedThreadsDao.ts
│   │       └── ShardedPostsDao.ts
│   │
│   ├── models/                   # 8 business logic models
│   │   ├── users.model.ts, threads.model.ts, posts.model.ts
│   │   ├── friends.model.ts, messages.model.ts
│   │   ├── notifications.model.ts, calls.model.ts
│   │   └── threadAdmin.model.ts
│   │
│   ├── database/                 # Sharding infrastructure (17 files)
│   │   ├── sharding/
│   │   │   ├── IShardRouter.ts           # Router interface
│   │   │   ├── ModuloShardRouter.ts      # user_id % num_shards
│   │   │   ├── SmartShardRouter.ts       # Intelligent query routing
│   │   │   ├── ShardHealthMonitor.ts     # Health tracking
│   │   │   ├── ShardRebalancingService.ts # Data redistribution
│   │   │   ├── ShardMetricsCollector.ts   # Performance metrics
│   │   │   ├── ShardConnectionManager.ts
│   │   │   ├── DataCoLocationService.ts
│   │   │   └── ContentDiscoveryService.ts
│   │   ├── DatabaseConnectionPoolManager.ts # Pool per shard
│   │   ├── ReadReplicaManager.ts            # Read/write splitting
│   │   ├── DualWriteMigrationService.ts     # Migration strategy
│   │   ├── FeedService.ts, FeedCacheService.ts
│   │   ├── MigrationRunner.ts
│   │   └── DATABASE_SCHEMA_DESIGN.md
│   │
│   ├── services/                 # Application services
│   │   ├── avatar/               # AvatarService, AvatarAnimations
│   │   ├── news/                 # NewsIngestionService (RSS)
│   │   ├── CallSignalingService.ts  # WebRTC signaling
│   │   ├── Emailservice.ts          # Nodemailer SMTP
│   │   ├── permissionsService.ts
│   │   ├── TaskStatusService.ts
│   │   ├── TaskAnalyticsService.ts
│   │   ├── WorkerAutoScaler.ts
│   │   ├── WorkerCoordinationService.ts
│   │   └── local-stt-server.js       # Whisper STT
│   │
│   ├── gateway/                  # GraphQL gateway
│   │   ├── GraphQLGateway.ts
│   │   ├── ServiceDiscovery.ts
│   │   ├── QueryOptimizer.ts
│   │   └── SubscriptionManager.ts
│   │
│   ├── graphql/                  # GraphQL context, enums
│   │   ├── context.ts
│   │   └── enums/                # FriendStatus, NotificationType, Perspective, PostType, UserRole
│   │
│   ├── auth/                     # Authentication middleware
│   │   └── getUserFromRequest.ts
│   │
│   ├── errors/                   # Enterprise error handling
│   │   ├── AppError.ts              # Base error classes (6 types + 40+ error codes)
│   │   └── ErrorHandler.ts          # 40+ typed error helper methods
│   │
│   ├── security/                 # Security services
│   │   ├── AIPermissionService.ts
│   │   ├── CredentialEncryptionService.ts
│   │   ├── SecurityMonitor.ts
│   │   ├── IncidentResponseService.ts
│   │   └── ShardSecurityPolicyService.ts
│   │
│   ├── cache/redis/              # Redis layer
│   │   ├── RedisCacheManager.ts
│   │   ├── RedisClusterManager.ts
│   │   ├── RedisIntegrationFactory.ts
│   │   ├── AITaskQueueManager.ts     # Priority queue with retry/dead-letter
│   │   └── RedisTypes.ts
│   │
│   ├── audit/                    # Enterprise audit logging
│   │   ├── EnterpriseAuditService.ts
│   │   ├── EnterpriseAuditRepository.ts
│   │   └── EnterpriseAuditTypes.ts
│   │
│   ├── migrations/               # 19 database migration files
│   │   ├── User, Post, Thread, Task, Audit, Security
│   │   ├── Friend, Vote, Notification, NewsArticle
│   │   └── Migration state tracking
│   │
│   └── utils/constants.ts
│
├── src/electron/
│   ├── main.cjs                  # Electron main process
│   ├── preload.cjs               # Context bridge
│   ├── stt-server.cjs            # Speech-to-text server
│   ├── convert-animation.js      # FBX to VRMA converter
│   ├── animations-converter/
│   └── frontend/
│       ├── app.js                # ~6400 lines, main Electron app logic
│       ├── index.html            # ~1560 lines, UI structure
│       ├── styles.css            # ~3750 lines, all styling
│       ├── ai-browser.html       # AI browser panel UI
│       ├── reset-password.html
│       ├── WhisperSpeech.js      # Local Whisper STT
│       ├── sentiment-analyzer.js # Content sentiment analysis
│       ├── assets/               # Images, icons, etc.
│       └── animations/           # 50 VRMA animation files
│
├── tests/                        # Unit + integration tests
│   ├── ai/, dao/, database/
│   ├── models/, resolvers/, services/
│   ├── integration/
│   ├── fixtures/, validation/
│   └── setup.ts, setup.cjs
│
├── docker/
│   ├── Dockerfile                # Production container
│   ├── Dockerfile.test           # Test container
│   ├── docker-compose.yml        # Full stack (DB, Redis, App, Tests)
│   ├── docker-compose.infra.yml  # Infrastructure (primary, 2 replicas, Redis cluster, PgBouncer)
│   └── init-db.sql               # Database bootstrap
│
├── scripts/                      # Docker test scripts, coverage checks, DB wait
│
└── reviewnotes/README.md         # ~2000+ lines of comprehensive design docs
```

## Infrastructure (Docker)

### Full Stack (docker-compose.yml)
- `postgres` — PostgreSQL 15 primary
- `redis` — Redis 7 cache/queue
- `app` — Node.js application
- `postgres-test` — Isolated test database
- `integration-tests` — Test runner (DOCKER_ENV=true)

### Infrastructure (docker-compose.infra.yml)
- `postgres-primary` — Write master (port 5433)
- `postgres-replica-1/2` — Hot standbys (ports 5435, 5434)
- `redis` — Single instance (port 6379)
- `redis-node-1/2/3` — 3-node Redis cluster (ports 7001-7003)
- `pgbouncer` — Connection pool (port 6432)

## Key Features

### Voice-Controlled AI Browser
- Natural language commands: "Go to YouTube and find latest news"
- 30+ website routing patterns (deterministic, no AI needed)
- Smart action planning with user approval workflow
- Sync navigation + async AI context loading

### Multi-AI Provider with Smart Fallback
- Ollama (local, default) — privacy-first, works offline
- ChatGPT, Claude, Gemini, Perplexity — premium providers
- Adapter pattern with common interface
- Circuit breakers, health-weighted routing, automatic fallback
- Provider health monitoring every 30s

### VRM Avatar System
- 50 VRMA animations (idle, dances, actions, emotions, sports, music)
- FBX to VRMA converter pipeline (Mixamo integration)
- Three.js + three-vrm rendering
- Scene caching, pause/resume when not visible
- Custom VRM upload from VRoid Studio
- AI-triggered emotional reactions

### Perspective Threads
- Pro / Against / Neutral discussion format
- Nested replies with media support
- Vote-based community moderation
- Thread admin permissions system

### Servers & Channels (Discord-like)
- Create servers with custom icons
- Text channels (general, announcements, topics)
- Server member management
- Messages and calls

### Database Sharding
- 4 shards with modulo routing (hash(user_id) % shard_count)
- SmartShardRouter for intelligent query routing
- Data co-location (user content on same shard)
- Read replicas for read/write splitting
- Auto-rebalancing when shards added/removed
- Connection pooling per shard
- Dual-write migration strategy

### Distributed Task Queue
- Redis-backed priority queue
- Worker pool with auto-scaling
- Retry with exponential backoff (max 3)
- Dead letter queue for failed tasks
- Real-time status via GraphQL subscriptions
- Task lifecycle: CREATED → QUEUED → PROCESSING → COMPLETED/FAILED

### News Ingestion
- RSS feed syncing from multiple sources
- AI-powered article summarization
- Content categorization
- News article entity with AI summaries

### Voice Control
- Whisper STT (local, tiny.en model, 39MB)
- Web Speech API as fallback
- Voice settings panel with microphone test
- Click-to-talk and continuous mode
- Text input fallback when voice unavailable

### Enterprise Error Handling
- 6 typed error classes (Authentication, Authorization, Validation, NotFound, BusinessLogic, System)
- 40+ error codes covering auth, validation, sharding, AI, and system errors
- 40+ helper methods in ErrorHandler class
- Used across 30+ files, 80+ error instances

### Security
- AI permission service (approve/deny AI actions)
- Credential encryption for API keys
- Security monitoring and incident response
- Shard security policy service

### Enterprise Audit
- Full audit logging for AI actions
- Provider health monitoring
- Rate limiting and quota management
- Session management across shards

## Commands

| Command | Description |
|---|---|
| `npm run start:dev` | Start backend only |
| `npm run electron:dev` | Start Electron only |
| `npm run electron:full:dev` | Start full app (Docker + Backend + Browser + Electron) |
| `npm run docker:up` | Start infrastructure (Postgres + Redis) |
| `npm run docker:down` | Stop infrastructure |
| `npm test` | Run unit tests |
| `npm run test:integration:docker` | Run integration tests in Docker |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run migration:run` | Run database migrations |
| `npm run migration:generate` | Create new migration |
| `npm run worker` | Start AI task worker |
| `npm run convert:animation` | Convert FBX to VRMA animation |
| `npm run dev` | Docker up + Electron full |

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/graphql` | POST | GraphQL API |
| `/api/ai-browser-command` | POST | Process voice/text commands |
| `/api/ai-chat` | POST | Chat with AI |
| `/api/ai-context` | POST | Async AI response after navigation |
| `/api/ai-providers` | GET | List AI provider status |
| `/api/ai-providers/configure` | POST | Configure AI provider |
| `/api/summarize-text` | POST | Summarize page content |
| `/api/news` | GET | Fetch news articles |
| `/api/news/sources` | GET | List news sources |
| `/api/news/sync` | POST | Trigger RSS feed sync |
| `/api/news/summarize` | POST | Summarize news article |
| `/api/ollama/status` | GET | Check Ollama status |
| `/api/ollama/diagnostics` | GET | Ollama diagnostics |
| `/api/ollama/repair` | POST | Trigger Ollama repair |
| `/api/ollama/refresh-models` | POST | Reinstall Ollama models |
| `/api/profile/upload` | POST | Upload profile picture |
| `/api/server/icon/upload` | POST | Upload server icon |

## Working Features

- AI browser with unified chat panel
- Voice command input (Whisper STT, settings panel)
- Navigation automation (30+ websites)
- WebsiteRouter deterministic routing
- Ollama integration with auto-repair
- Thread list with thumbnails
- Reply system
- VRM avatar with 50 animations
- 5 AI adapters (all working)
- Database sharding infrastructure
- Distributed task queue
- GraphQL API with subscriptions
- Animations floating panel
- Avatar scene caching
- Browser window avatar pause/resume
- Voice Settings Panel with microphone test
- Text-to-Speech fallback when voice fails
- Unified ErrorHandler system across entire backend (80+ errors fixed)
- Voice control with Whisper STT (local, no cloud dependency)

## In Progress

- Avatar emotional reactions (sentiment-driven expressions)
- Privacy indicator
- Demo flow polish
- Continuous voice mode
- Avatar emotions (happy, sad, concerned, excited)

## Vision

> *"The Rev gives everyone access to AI-powered understanding. Not just for tech people. Not just for news junkies. For EVERYONE."*

The avatar is the bridge between the complex world and simple understanding. Meeting people where they already are (social media), simplifying complex information with AI, and building community around understanding.

---

*Last updated: May 2026*
