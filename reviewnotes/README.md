# TheRev - THE REVOLUTION

> **"I want to revolutionize how people ingest media so they are aware of what's really going on in the world."**

---

## The Vision

**TheRev = The Revolution**

Technology is in a revolutionary state. Everyone needs access to AI to understand what's happening. But:

- Average American reads at **6th grade level**
- People **love social media**
- Complex news **confuses instead of informs**
- Disinformation spreads faster than truth

**The solution:**

- Meet people where they ARE (social media)
- Simplify with AI + Avatar
- Make complex = simple
- Build community around understanding
- Work together to make world better

---

## The Mission

```
The Rev exists to:

1. Make AI accessible to EVERYONE
2. Simplify complex information
3. Meet people where they consume (social platforms)
4. Build community around understanding
5. Create informed citizens working for better world
```

---

## The Avatar's Role

The avatar is the bridge between complex world and simple understanding.

**Example - Economy News:**

BEFORE (complex):

```
"The Federal Reserve's monetary policy adjustments
have led to a 3.2% inflation increase..."
```

AFTER (simple):

```
Avatar: "Hey! Let me break this down for you..."

"Banks raised prices on stuff. Interest rates going up.

What this means for YOUR money:
• Credit card rates higher
• Car loans more expensive
• Savings accounts pay more"

Avatar: "So if you're thinking about buying a car, maybe wait."
```

**Simple. Visual. Actionable. Human.**

---

## The Social Angle

**NOT:**

- ❌ Engagement farming
- ❌ Viral outrage
- ❌ Algorithmic addiction

**IS:**

- ✅ Shared understanding
- ✅ Community building
- ✅ Working together for better world
- ✅ Meeting people where they already are

---

## The Positioning

**NOT:** "AI browsing app"
**NOT:** "Privacy browser"  
**NOT:** "Social media platform"

**THIS:** **"The Revolution starts with informed citizens"**

### The Pitch

```
The Rev gives everyone access to AI-powered understanding.

Not just for tech people.
Not just for news junkies.
For EVERYONE.

Simple explanations.
Community support.
Real action.

The revolution is information.
We're making it accessible.
```

---

## Taglines

- "Understand the world. Simple."
- "AI for everyone, not just tech people."
- "The revolution starts with understanding."
- "We break it down. You decide."
- "Smart news for real people."
- "Meet your AI companion for the real world."
- "TheRev: The Revolution starts here."

---

## Why Breadth Wins Here

**The "simplify" advice assumes:**

- Users get confused by features
- Less = better UX
- One hook is enough

**What if:**

- Users want a platform, not a tool
- Features that work together create power
- Revolution needs many entry points
- Community requires shared space

**TheRev is:**

- Social ✅ (where people already are)
- Voice ✅ (easiest interface)
- AI ✅ (democratized access)
- Avatar ✅ (simplifies everything)
- Privacy ✅ (trust layer)
- Browser ✅ (content is everywhere)

**It's ALL of it because different people learn differently.**

---

## Project Overview (Technical)

**TheRev** is an AI-powered platform combining social, voice control, avatars, and local AI. Built with:

- Electron desktop app
- PostgreSQL + TypeORM
- GraphQL API
- Ollama for local AI
- VRM avatars
- Whisper for voice

---

## Project Vision

---

## Technology Stack

### Backend

| Technology                      | Purpose            | Why                                             |
| ------------------------------- | ------------------ | ----------------------------------------------- |
| **Node.js + TypeScript**        | Runtime & language | Full type safety, modern async patterns         |
| **Type-GraphQL + graphql-yoga** | API layer          | Type-safe GraphQL, subscriptions, rate limiting |
| **PostgreSQL + TypeORM**        | Primary database   | ACID compliance, sharding capability            |
| **Redis (single + cluster)**    | Caching & queues   | Sub-millisecond reads, pub/sub, task queue      |

### Frontend

| Technology               | Purpose       | Why                                   |
| ------------------------ | ------------- | ------------------------------------- |
| **Electron**             | Desktop app   | Cross-platform, native APIs, WebView2 |
| **Three.js + three-vrm** | 3D rendering  | VRM model support, avatar animations  |
| **Web Speech API**       | Voice control | Native browser speech recognition     |

### AI & Automation

| Technology                 | Purpose            | Why                        |
| -------------------------- | ------------------ | -------------------------- |
| **OpenAI**                 | Premium AI         | Best reasoning models      |
| **Anthropic Claude**       | Premium AI         | Long context, safety       |
| **Google Gemini**          | Premium AI         | Multimodal, fast           |
| **Perplexity**             | Search AI          | Real-time web knowledge    |
| **Ollama**                 | Local AI           | Zero API costs, privacy    |
| **Playwright + Puppeteer** | Browser automation | Web scraping, form filling |
| **WebView2**               | User browser       | Native browsing experience |

---

## Architecture Deep Dive

### Database Sharding System

**Problem Solved**: As user count grows, a single database becomes a bottleneck. We need horizontal scaling.

**Implementation**:

```
src/database/sharding/
├── IShardRouter.ts        # Interface for shard routing strategies
├── ModuloShardRouter.ts   # Simple user_id % num_shards
├── SmartShardRouter.ts    # Intelligent routing based on query patterns
└── ShardHealthMonitor.ts  # Track shard health, trigger rebalancing
```

**Key Files**:

- `DatabaseConnectionPoolManager.ts` - Manages connection pools per shard
- `ReadReplicaManager.ts` - Routes reads to replicas, writes to primary
- `ShardRebalancer.ts` - Redistributes data when shards are added/removed

**Lessons Learned**:

- Shard keys must be chosen carefully (user_id is good for social, content_id is good for feeds)
- Read replicas add ~30% infrastructure complexity but handle 10x read load
- Connection pooling prevents the "thundering herd" problem

### Multi-AI Provider Router

**Problem Solved**: Different AI providers excel at different tasks. We need intelligent routing.

**Architecture**:

```
AI Intent Classifier (700+ lines)
    │
    ├─→ Navigation Intent → WebsiteRouter (30+ patterns)
    │
    ├─→ Simple Question → Deterministic Response
    │
    └─→ Complex Task → AI Router
            │
            ├─→ Health-weighted routing
            ├─→ Latency-based selection
            ├─→ Capability matching
            └─→ Automatic fallback
```

**Adapter Pattern**:

```typescript
interface AIAdapter {
  complete(prompt: string, options?: CompletionOptions): Promise<AIResponse>;
  getHealth(): Promise<ProviderHealth>;
  getCapabilities(): ProviderCapabilities;
}
```

**Each adapter**:

- OpenAIAdapter - GPT-4, GPT-4 Turbo, GPT-3.5
- ClaudeAdapter - Claude 3 Opus, Sonnet, Haiku
- GeminiAdapter - Gemini Pro, Gemini Vision
- PerplexityAdapter - Sonar, Sonar Pro
- OllamaAdapter - Llama, Mistral, Phi (local)

**SmartFallbackService**:

- Tracks provider health via circuit breakers
- Routes based on: latency, cost, capability match
- Falls back to next available provider on failure
- Exponential backoff with jitter

### Browser Automation Platform

**Problem Solved**: Users want to say "search YouTube for cats" and have it work instantly without AI.

**Three Browsing Modalities**:

1. **WebView2 (User-facing)**
   - Native Chromium embedded in Electron
   - Full JavaScript support
   - Cookie sharing with system browser

2. **Playwright Server (AI Automation)**
   - Headless browser as API
   - `/click`, `/type`, `/scroll`, `/fill-form` endpoints
   - Screenshot capability
   - Used for AI-controlled tasks

3. **WebsiteRouter (Deterministic)**
   - 30+ website patterns
   - No AI needed for navigation
   - Instant response
   - Falls back to Google search

**Navigation Flow**:

```
User: "search youtube for cats"
    │
    ↓
AIIntentClassifier: Detects "navigation" intent
    │
    ↓
WebsiteRouter: Matches "youtube" pattern
    │
    ↓
Returns: { url: "https://youtube.com/results?search_query=cats" }
    │
    ↓
WebView2: Navigate directly
```

### Distributed Task Queue

**Problem Solved**: Long-running AI tasks block the main thread. We need background processing.

**Implementation**:

```
src/services/TaskQueue.ts (638 lines)
    │
    ├─→ Redis-backed priority queue
    ├─→ Worker pool with auto-scaling
    ├─→ Retry with exponential backoff
    └─→ Real-time status via GraphQL subscriptions
```

**Task Lifecycle**:

```
CREATED → QUEUED → PROCESSING → COMPLETED
                    ↓
                  FAILED → RETRY (max 3) → DEAD_LETTER
```

---

## The Ollama Story

### Why Ollama Matters

Ollama enables **local AI inference** - no API calls, no per-token costs, complete privacy. For a product targeting millions of users, this is transformational.

**Problem**: Ollama on Windows with NVIDIA GPUs can enter a corrupted state where all model requests fail with CUDA errors. Non-technical users can't debug this.

### The Solution: OllamaRepairService

**File**: `src/ai/OllamaRepairService.ts`

**Capabilities**:

1. **Diagnostics**: Checks Ollama health, model loading, GPU state
2. **Error Detection**: Identifies corruption patterns
3. **Automatic Recovery**:
   - Kill all Ollama processes
   - Restart in CPU mode (bypasses GPU)
   - Clear model cache
   - Full reinstall if needed

**Startup Repair Flow**:

```
App Starts
    │
    ↓
Test Ollama Connection
    │
    ├─→ Success → Ready
    │
    └─→ CUDA Error → Trigger Repair
            │
            ├─→ Kill processes
            ├─→ CPU mode restart
            ├─→ Cache clear
            └─→ Reinstall (if needed)
```

**Why This Matters**: Without this, every user with GPU corruption abandons the app. With this, we auto-heal and retain users.

---

## Voice Control System

### Current Implementation

**Speech Recognition**:

- Uses Web Speech API (`SpeechRecognition`)
- Click-to-talk mode: User clicks mic, speaks, clicks again to stop
- Continuous mode: Optional always-listening

**Text-to-Speech**:

- Uses Web Speech API (`speechSynthesis`)
- Rev's responses are spoken aloud
- Configurable voice/rate/pitch

### Integration Points

```javascript
// In app.js
setupVoiceControl(); // Initialize speech recognition
startListening(); // Begin capturing audio
stopListening(); // Stop and process transcript
speakText(text); // Make Rev speak
```

**Current Bug**: Voice turns off immediately after turning on - the `continuous` mode or event handlers need debugging.

---

## Avatar System

### VRM Pipeline

**What is VRM?**: VRM (Virtual Reality Modeling) is a file format for 3D avatars. Think GLTF but specifically designed for humanoid characters with blend shapes.

**Libraries**:

- `three-vrm` - Loads VRM files into Three.js
- `three-vrm-animation` - Plays VRMA animation clips

### Animation System

**25 VRMA Animations** loaded and working:

- Idle variations (Standard Idle, Bored Idle)
- Dances (Gangnam Style, Wave, etc.)
- Actions (Thumbs Up, Pointing, etc.)
- Emotions (Happy, Sad, Angry, Thinking)

**Animation Blending**:

- VRM uses humanoid bone structure
- Animations target specific bones
- Smooth transitions between animations
- Procedural fallback for emotions without animations

### Avatar Controls

**User Controls**:

- Rotate (drag or buttons)
- Zoom (scroll or buttons)
- Emotions (sidebar selection)
- Upload custom VRM

**AI Controls**:

- Emotions triggered by AI responses
- Speech bubble overlays
- Typing indicator

---

## Tab Caching & Performance

### Problem

Tab content was refreshing every switch, causing delays. Avatar animation was running even when not visible.

### Solution

**Tab Cache Object**:

```javascript
_tabCache = {
  threads: { data, timestamp },
  news: { data, timestamp, rawData },
  profile: { data, timestamp },
  avatar: { loaded, vrmDataUrl, fileName },
};
```

**5-minute TTL**: Cache valid for 5 minutes, then refreshes.

**Avatar Optimization**:

- Scene cached in memory
- Animation loop pauses when not visible
- Renderer hidden when not on avatar/profile tab
- Browser window opens → avatar pauses → window closes → avatar resumes

---

## Current Working State (3/23/26)

### ✅ Complete Features

- [x] AI Browser with unified chat panel
- [x] Voice command input (now with settings panel)
- [x] Navigation automation (30+ websites)
- [x] WebsiteRouter deterministic routing
- [x] Ollama integration with auto-repair
- [x] Thread list with thumbnails
- [x] Reply system
- [x] VRM avatar with animations
- [x] 5 AI adapters (all working)
- [x] Database sharding infrastructure
- [x] Distributed task queue
- [x] GraphQL API with subscriptions
- [x] Animations floating panel
- [x] Avatar scene caching
- [x] Browser window avatar pause/resume
- [x] Voice Settings Panel with microphone test
- [x] Text-to-Speech fallback when voice fails
- [x] Unified ErrorHandler system across entire backend (80+ errors fixed)

### 🔧 Voice Control - In Progress

**Status**: Voice works but requires internet for Google Speech API

**Current Issue**: Web Speech API needs connection to `speech.googleapis.com`

- Microphone works ✅ (detects 3 devices)
- Internet connectivity works ✅
- Google API ping works ✅
- **WebSocket to Google fails** - returns 400 error (Norton was blocking, now uninstalled)

**User Actions Required**:

1. ✅ Norton uninstalled
2. Restart PC after Norton uninstall
3. Test voice button again

**If Still Failing**:

- Voice button now opens text input modal as fallback
- Type commands like "go to gmail", "search for news"
- Commands work offline via text

### 📋 Voice Settings Panel

**Location**: ⚙️ button next to voice button in AI command bar

**Features**:

- Microphone status display
- "Test Microphone" button with audio visualization
- Internet connectivity check
- WebSocket connectivity check
- Language selector (English, Spanish, French, German, etc.)
- Enable/disable toggle

### 📋 ErrorHandler System

All backend errors now use unified `ErrorHandler` class:

**Files Updated** (30+ files, 80+ errors):

- Resolvers: Thread.ts, Post.ts, User.ts
- Models: users.model.ts, posts.model.ts, threads.model.ts
- DAOs: users.dao.ts, threads.dao.ts, posts.dao.ts
- AI Adapters: Ollama, Perplexity, Gemini, Claude, ChatGPT
- Services: EmailService, AvatarService, TaskStatusService
- Browser: BrowserManager, BrowserSandbox, BrowserAdapter, AutomationRunner
- Security: AIPermissionService, CredentialEncryptionService
- And more...

**Error Types**:

- `ErrorHandler.notAuthenticated()` - User not logged in
- `ErrorHandler.userNotFound(id)` - User doesn't exist
- `ErrorHandler.threadNotFound(id)` - Thread doesn't exist
- `ErrorHandler.postNotFound(id)` - Post doesn't exist
- `ErrorHandler.insufficientPermissions(action, resource)` - Permission denied
- `ErrorHandler.serviceUnavailable(service)` - Service down
- `ErrorHandler.operationNotAllowed(message)` - Invalid operation
- `ErrorHandler.invalidInput(message)` - Bad input
- `ErrorHandler.emailSendFailed()` - Email failed
- `ErrorHandler.internalServerError(details)` - Server error

### 📋 Tomorrow's Priorities

1. Test voice after Norton removal + PC restart
2. Verify voice settings panel works
3. Test microphone test button with audio visualization
4. Test text fallback modal for voice commands

---

## Voice Control - 3/26/26 Updates

### Major Changes

**1. Voice Control in AI Browser Window**

- Voice button now works in AI Browser window (separate from main app)
- Voice assigned to `window.handleVoiceClick` for inline onclick accessibility
- Removed Vosk references, now using Whisper STT
- Added session permissions for AI browser window microphone access
- Inline WhisperSpeech fallback if module import fails

**2. AI Response Flow (Sync vs Async)**

- **Navigation is SYNC** - happens immediately for fast response
- **AI context is ASYNC** - loads in background after navigation
- Questions like "what is machine learning" now:
  1. Navigate instantly to Google
  2. AI response fetched via `/api/ai-context` endpoint
  3. Response pops into chat after ~5-10 seconds

**3. Auto-Install Ollama Models**

- Models auto-install if missing: `mistral:latest`, `llama3.2:3b`
- Both Electron main process and backend check/install
- New endpoint: `/api/ollama/refresh-models` to reinstall models
- New endpoint: `/api/summarize-text` for page summarization

**4. UI Fixes**

- Voice button now smaller purple circle with 🎤 icon (not "CLICK ME")
- Chat scroll now works (removed `pointer-events: none`)
- Scrollbar styling added
- Loading screen shows startup progress

### Key Files Updated

| File                                    | Changes                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/index.ts`                          | Added `/api/ai-context` endpoint, `/api/ollama/refresh-models`, auto-install Ollama |
| `src/electron/main.cjs`                 | Updated `ensureOllamaModel()` to install both models, added permission handlers     |
| `src/electron/frontend/ai-browser.html` | Fixed voice button, scroll fix, async context fetch                                 |
| `src/ai/OllamaRepairService.ts`         | Added `pullModel()` and `pullCoreModels()` methods                                  |
| `package.json`                          | Removed vosk-browser dependency                                                     |

### Voice Command Flow

```
User clicks mic → Speaks → Audio sent to STT server (Whisper)
                                    ↓
            Transcript sent to /api/ai-browser-command
                                    ↓
        Backend routes to Google/YouTube/etc (instant)
                                    ↓
        Frontend navigates IMMEDIATELY (sync)
                                    ↓
        Backend generates AI response ASYNC via /api/ai-context
                                    ↓
        Response pops into chat after 5-10 seconds
```

### API Endpoints

| Endpoint                     | Method | Purpose                                             |
| ---------------------------- | ------ | --------------------------------------------------- |
| `/api/ai-browser-command`    | POST   | Process voice/text commands, returns navigation URL |
| `/api/ai-context`            | POST   | Generate AI response for questions (async)          |
| `/api/summarize-text`        | POST   | Summarize page content                              |
| `/api/ollama/status`         | GET    | Check Ollama status                                 |
| `/api/ollama/refresh-models` | POST   | Reinstall Ollama models                             |

### Ollama Model Status

| Model             | Size  | Status            |
| ----------------- | ----- | ----------------- |
| mistral:latest    | 4.4GB | ✅ Auto-installed |
| llama3.2:3b       | ~2GB  | ✅ Auto-installed |
| base.en (Whisper) | 142MB | ✅ For STT        |

---

## Voice Control - 3/25/26 Updates

### Issues Fixed

**Problem 1**: "search for X" queries classified as UNKNOWN

- Added smarter NAVIGATE_URL patterns to catch common search phrases
- Added fallback in index.ts to route low-confidence intents to search
- Now works: "June for Carmelo Anthony highlights" → YouTube search

**Problem 2**: Latency too slow (was 5+ seconds)

- Changed STT model from `base.en` (142MB) to `tiny.en` (39MB)
- Reduced silence threshold: 0.02 → 0.015
- Reduced silence wait: 2000ms → 1500ms
- Reduced minimum recording: 1500ms → 1000ms
- Added `/warmup` endpoint to pre-load model at startup
- Model now pre-warms automatically on app start

**New Patterns Added**:

- `^(find|watch|see|look)\s+(for\s+)?(.+)` - catch search queries
- `^(what\s+is|who\s+is|when\s+did|where\s+is)\s+` - question intents
- `^(how\s+to|how\s+do|how\s+can)\s+` - how-to queries
- `^(show\s+me|find\s+me|get\s+me)\s+` - direct commands
- `^(play|watching|viewing)\s+(.+)` - media intents
- `(.+)\s+(highlights|compilation|mixes?|edits?)` - video content

### Expected Performance

- Voice activation → transcription: ~500ms
- Total latency (transcribe + route): ~1-2 seconds
- Much faster than before (was 5+ seconds)

---

## Ollama Model Status

| Model        | Size  | Status     |
| ------------ | ----- | ---------- |
| Llama 3.2 1B | 1.3GB | ✅ Working |
| Mistral      | 4.4GB | ✅ Working |
| TinyLlama    | 637MB | ✅ Working |

---

## Key Files Reference

### Core AI

| File                             | Lines | Purpose                    |
| -------------------------------- | ----- | -------------------------- |
| `src/ai/AIIntentClassifier.ts`   | 700+  | Classifies user intent     |
| `src/ai/WebsiteRouter.ts`        | ~400  | 30+ website patterns       |
| `src/ai/OllamaRepairService.ts`  | ~300  | Auto-repair GPU corruption |
| `src/ai/SmartFallbackService.ts` | ~200  | Provider fallback          |

### AI Adapters

| File                                   | Purpose            |
| -------------------------------------- | ------------------ |
| `src/ai/adapters/OpenAIAdapter.ts`     | GPT-4, GPT-3.5     |
| `src/ai/adapters/ClaudeAdapter.ts`     | Claude 3 family    |
| `src/ai/adapters/GeminiAdapter.ts`     | Gemini Pro, Vision |
| `src/ai/adapters/PerplexityAdapter.ts` | Real-time search   |
| `src/ai/adapters/OllamaAdapter.ts`     | Local inference    |

### Database

| File                                            | Purpose              |
| ----------------------------------------------- | -------------------- |
| `src/database/sharding/IShardRouter.ts`         | Router interface     |
| `src/database/sharding/SmartShardRouter.ts`     | Intelligent routing  |
| `src/database/DatabaseConnectionPoolManager.ts` | Pool per shard       |
| `src/database/ReadReplicaManager.ts`            | Read/write splitting |

### Frontend

| File                               | Lines | Purpose           |
| ---------------------------------- | ----- | ----------------- |
| `src/electron/frontend/app.js`     | ~6400 | Main Electron app |
| `src/electron/frontend/index.html` | ~1560 | UI structure      |
| `src/electron/frontend/styles.css` | ~3750 | All styling       |

### Browser

| File                                    | Purpose                 |
| --------------------------------------- | ----------------------- |
| `src/browser/automation-server.cjs`     | Playwright API server   |
| `src/electron/frontend/ai-browser.html` | AI browser panel        |
| `src/electron/main.cjs`                 | Browser window creation |

---

## Interview Talking Points

### "Tell me about a challenging technical problem you solved."

_"I built a sharded database system that handles horizontal scaling. The tricky part was choosing the shard key - I initially tried content-based sharding but hit hotspots when viral content flooded a single shard. I switched to user-based sharding with a SmartShardRouter that could re-route queries based on access patterns. I also implemented automatic failover to read replicas and a connection pool manager that prevents connection exhaustion."_

### "How do you handle multiple AI providers?"

_"I built an adapter pattern where each provider implements a common interface. A SmartFallbackService tracks provider health via circuit breakers, routes based on latency/cost/capability, and automatically falls back when providers fail. The Ollama integration was especially challenging - I had to build an auto-repair service because GPU corruption was preventing users from running local AI. Without this, every Windows user with corrupted drivers would just abandon the app."_

### "Describe your experience with distributed systems."

_"I implemented a Redis-backed task queue with priority queuing, automatic retry with exponential backoff, and worker coordination. I learned that distributed systems fail in partial ways - a worker might crash mid-task, leaving it in an inconsistent state. I added idempotency keys and dead letter queues to handle these edge cases."_

### "How do you approach performance optimization?"

_"On TheRev, I noticed the 3D avatar animation loop was running even when the avatar wasn't visible, causing browser sluggishness. I implemented a pause/resume system where the animation loop only runs when the avatar section is active. I also added tab caching so content doesn't reload on every switch. These small optimizations compound - the browser went from noticeably laggy to smooth."_

### "What would you do differently?"

_"I'd start with a more incremental approach. I built too much infrastructure upfront before validating the core user experience. The sharding system is enterprise-grade, but I should have proven the product-market fit first with a simple single-database architecture. That said, when I do need to scale, the infrastructure is already there."_

---

## The Story So Far

TheRev represents the journey of a solo developer learning enterprise patterns in real-time. Starting with a simple idea - an AI-powered avatar that browses the web - the project grew into a comprehensive demonstration of:

- **System design** through database sharding
- **API architecture** through GraphQL
- **Reliability engineering** through auto-repair systems
- **Performance optimization** through caching and pausing
- **User experience** through voice control and 3D graphics

The most impressive part isn't any single feature - it's that these patterns typically require teams of engineers working for years. A solo developer built this, which demonstrates not just technical skill but the ability to learn, iterate, and solve problems independently.

---

_Last Updated: 3/26/26_
_Next Session: Test voice in AI browser, verify async AI context loads after navigation_

---

## The Rev - UX Vision (3/26/26)

### The Problem We're Solving

People are tired of:

- Apps that track everything they do
- AI that feels like a chatbot, not a companion
- Having to click, scroll, type - when they could just talk
- News that makes them feel overwhelmed, not informed

### The Vision

**TheRev isn't an app. It's your AI buddy who browses the web with you.**

> "Your privacy-first, voice-controlled browsing companion that reacts to the internet alongside you"

---

## External Review Feedback (3/26/26)

### Assessment: "This is actually a product, not just a build"

> "You've officially crossed into: 'this could be a real startup' territory"

**What they nailed:**

- Clear problem, vision, hooks, user journeys, differentiation, MVP scope
- "AI buddy who browses the web with you" = strong positioning
- Avatar reactions = humanizing the internet
- Privacy positioning builds trust
- 5-second demo = investor-ready

---

### Critical Critique

#### Problem 1: Still TWO Products

**Current:**

- Product A: AI browsing companion
- Product B: Privacy browser

**User confusion:** "Am I here for privacy? AI? Avatar? Voice?"

**Fix:** Pick ONE primary identity:

> "AI companion for browsing" as the core
> Privacy = trust layer
> Browser = infrastructure

---

#### Problem 2: Avatar Reactions Can Feel Gimmicky

**Risk:** "Oh, it's reacting again..." → users turn it off

**Fix:** Make reactions:

- Subtle, not constant
- Context-aware
- Only on important moments
- When user pauses
- When emotion is strong

**Think:** "Companion with timing" not "Emoji machine"

---

#### Problem 3: Voice Should Be Optional, Not Forced

**Risk:** Most users are in public, don't want to talk, don't trust voice yet

**Fix:** Voice-available, not voice-required

---

#### Problem 4: Cognitive Load Still Too High

**Current:** avatar + voice + browser + AI + news + privacy

**Fix:** On first use, show ONE thing

---

### 🎯 The Magic Moment (MOST IMPORTANT)

**Obsess over this:**

```
User opens app
       ↓
Sees article
       ↓
Avatar reacts + explains
       ↓
User feels: "Oh… this is different"
```

**If that moment works:** You win
**If it doesn't:** Nothing else matters

---

### What to Change (High Impact)

1. **Make Avatar Reactions the ENTRY** - not a feature, first thing user sees
2. **Delay Everything Else** - browser → secondary, voice → optional, settings → hidden
3. **Make AI Feel Instant** - preload, stream, partial responses
4. **Add Personality** - slight humor, consistent tone, memory callbacks

---

### Positioning That Wins

**Not:** "Privacy browser" or "AI app"

**This:** "The internet, but with someone to process it with you"

---

### Biggest Risk

**Not tech. Not infra.**

**Will users care enough to switch behavior?**

---

### Next Priority

👉 Design the exact onboarding + first 60 seconds

Because that's where this either:

- Becomes addictive
- Or gets abandoned

---

## The 5 Hook Moments

### Hook #1: Avatar Reactions (HIGHEST PRIORITY)

**The Moment**: User sees their avatar respond emotionally to content they're browsing

**Why It Works**:

- Emotional connection > information
- Feels like browsing with a friend
- Makes news less overwhelming (you have someone to process it with)

**The Experience**:

```
User scrolls past article about economy
Avatar: 😰 *concerned expression*
Avatar: "Yikes. Gas prices are up again. Want me to find cheaper alternatives?"

User searches for vacation destinations
Avatar: 🤩 *excited expression*
Avatar: "Ooh, Portugal! I found some amazing hostels under $40/night. Want me to pull up details?"

User sees cute dog video
Avatar: 🐕 *happy expression*
Avatar: "Aww, look at that good boy! Want me to find more wholesome content?"
```

**Implementation**:

- Sentiment analysis on article titles/snippets (simple keyword matching to start)
- Emotion keywords: economy→concerned, travel→excited, cute→happy, disaster→sad
- Map emotions to avatar blend shapes/expressions
- Randomize reactions slightly so it doesn't feel robotic

---

### Hook #2: True Voice-First

**The Moment**: User realizes they can navigate the entire web without touching the keyboard

**Why It Works**:

- Hands-free browsing is genuinely useful
- Sets us apart from every other browser
- Feels futuristic

**The Experience**:

```
User (driving, cooking, relaxing): "Rev, find me news about electric cars"

Rev: "On it!" *opens browser, searches*
Rev: "Found 5 articles. Top story: Tesla announces new affordable model..."

User: "Skip the Elon drama, show me the tech specs"

Rev: *already filtering* "Here's the tech breakdown..." *shows relevant article*

User: "Add this to my reading list"

Rev: "Done! Saved for later." *shows confirmation*
```

**Implementation**:

- Wake word detection (optional "Hey Rev" mode)
- Continuous listening mode (toggle in settings)
- Interrupt handling: user can cut off avatar mid-sentence
- Voice loading states ("Let me find that...", "Searching now...")
- Text-to-speech for avatar responses (Web Speech API or local TTS)

---

### Hook #3: Privacy That Matters

**The Moment**: User learns about our dual privacy model

**Why It Works**:

- Privacy is a growing concern
- People don't realize Chrome/Google sells their data
- We're honest about our privacy tiers

---

## Privacy Model (Honest Approach)

### Tier 1: Local AI (Default) - True Privacy

```
User query → Your device → Ollama → Response
                   ↑
            100% Private
            We see nothing
            No data leaves machine
```

**When user uses Ollama (default):**

- ✅ AI runs 100% on their device
- ✅ No data sent anywhere
- ✅ No logs, no tracking
- ✅ Works offline

---

### Tier 2: API Keys (Optional) - Transparent Relay

```
User query → Our UI → OpenAI/Claude API → Response
                     ↑
            We relay, but DON'T store
            Their queries go directly to them
            We never log or see it
```

**When user adds API key:**

- ⚠️ Queries pass through our UI to their chosen provider
- ✅ We honestly don't store or log their queries
- ✅ They're using their own account/billing
- ✅ We're just a prettier interface
- ⚠️ Full privacy depends on their chosen provider's policy

---

### The Honest Privacy Settings UI

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 AI Provider                                            │
├─────────────────────────────────────────────────────────────┤
│  ○ Local AI (Ollama) ← RECOMMENDED                        │
│    ✓ 100% Private                                          │
│    ✓ No data leaves your device                           │
│    ✓ Works offline                                        │
│    ✓ Free to use                                          │
│                                                             │
│  ○ Premium AI (API Key)                                    │
│    ⚠️ Queries go through selected provider                 │
│    ⚠️ Privacy depends on their policy                     │
│    ✓ Better AI quality                                    │
│    ✓ You pay for your own usage                           │
├─────────────────────────────────────────────────────────────┤
│  API Provider: [Claude ▼]                                  │
│  API Key: [••••••••••••••••••••]                          │
│                                                             │
│  ℹ️ We don't store your queries. They go directly to      │
│     your chosen provider. We're just a UI layer.           │
└─────────────────────────────────────────────────────────────┘
```

---

### The Pitch (Honest)

```
🛡️ Your Privacy, Your Choice

Default (Ollama):
"Everything runs on YOUR computer. We never see your
searches, your voice commands, or your browsing history.
100% private. Works offline."

With API Key:
"Your queries go directly to Anthropic/OpenAI.
We relay them - but we don't store them.
You're using your own account, your own billing."

Chrome sells your data.
We're honest about ours.
```

---

### Provider Privacy Comparison

| Provider       | Privacy         | Quality | Cost      |
| -------------- | --------------- | ------- | --------- |
| Ollama (local) | ✅ 100% private | Good    | Free      |
| Claude (API)   | ⚠️ Their policy | Great   | User pays |
| GPT-4 (API)    | ⚠️ Their policy | Great   | User pays |
| Gemini (API)   | ⚠️ Their policy | Great   | User pays |

---

### First Launch Privacy Message

```
"Welcome to TheRev! Before we start - your privacy matters.

By default, everything runs on YOUR computer using Ollama.
We never see your searches, voice commands, or history.

Want even better AI? Add your own API key.
Your queries go directly to them - we don't store anything.

Ready to browse without being watched?"
```

🛡️ Your Data Stays Yours

• AI runs locally (Ollama)
• No cloud API calls
• No tracking pixels
• No data sold to advertisers

Chrome sees everything you do.
We see nothing.

```

**The Experience**:

```

First launch:
"Welcome to TheRev! Before we start - your privacy matters.
Everything runs on YOUR computer. We never see your searches,
your voice commands, or your browsing history.

Ready to browse without being watched?"

Settings panel shows:
"🔒 Privacy Mode: ON
AI Processing: Local (Ollama)
Cloud Connection: None
Data Collection: Zero"

```

---

### Hook #4: Context Memory

**The Moment**: App remembers previous conversations and builds on them

**Why It Works**:

- Makes the AI feel smart
- Reduces friction (don't repeat yourself)
- Creates habit-forming behavior

**The Experience**:

```

Day 1:
User: "I'm interested in sustainable investing"
Rev: "Smart choice! I'll track ESG-focused funds and green tech news for you."

Day 2:
User opens app
Rev: "Good morning! Found 3 new sustainable investing articles.
The big story: BlackRock's ESG assets hit record high."

Day 3:
User: "show me those articles"
Rev: _already has them ready_ "Here you go!" _loads articles_
Rev: "Also, SolarEdge stock dropped 15% - still want to track it?"

```

**Implementation**:

- Session storage (localStorage for MVP, Redis for production)
- Conversation context window (last 10 exchanges)
- User interest keywords (saved from conversations)
- Smart pre-loading of relevant content

---

### Hook #5: The 5-Second Demo

**The Moment**: New user sees the app in action and gets hooked in under 10 seconds

**Why It Works**:

- First impression is everything
- Easy to demo to friends/investors
- Proves the concept instantly

**The Perfect Demo Script** (10 seconds):

```

1. "This is Rev - your AI browsing companion"
   _click mic_

2. "Find me news about the Mars mission"
   _avatar listens_

3. _browser opens, searches, avatar summarizes_
   "Found it! NASA's Perseverance discovered..."

4. "Privacy-focused, voice-controlled, runs locally."
   _show privacy indicator_

5. "That's TheRev."

```

**Onboarding Flow**:

```

Step 1: (5 seconds) - THE HOOK
"Meet Rev - your AI browsing buddy"
[Avatar appears]
Rev: "Hey! Ready to browse the web with me?"

Step 2: (10 seconds) - THE DEMO
"Watch this..."
[Show an article]
Rev: _reacts_ "Wow, that's intense. Want me to find more on this?"
[User clicks mic]
User: "Find me news about..."
Rev: _opens browser, searches_ "Found it! Here's what I got"

Step 3: (5 seconds) - THE PITCH
Rev: "By the way - everything stays on your device. I'm yours."
[Show privacy badge]

Step 4: (5 seconds) - THE INVITE
"What do you want to explore?"
[Suggested prompts: "Find me news about...", "Search YouTube for...", "What's trending today?"]

```

---

## User Journey Maps

### Morning News Ritual

```

Wake up
↓
Open TheRev
↓
Avatar: "Good morning! Here's what's happening:"
↓
[Summarized news cards with emotions]
↓
Click/tap article → Browser opens
↓
Avatar reacts to content
↓
Ask follow-up questions
↓
Save interesting stuff
↓
Done in 5 minutes, feel informed

```

### Research Deep-Dive

```

User: "I want to buy an electric car"
↓
Rev: "Great topic! Let's find the best options for you."
↓
Browse multiple sources
Rev: _updating context with each article_
↓
User: "Compare Tesla vs Rivian"
Rev: "Here's the breakdown..."
↓
User: "Add to comparison list"
Rev: "Done! Here's your growing comparison..."
↓
User: "Show me reviews from real owners"
Rev: _finds forum discussions_

```

### Casual Browsing

```

User bored, opens app
↓
Avatar: "Anything specific or just exploring?"
↓
User: "Show me something interesting"
↓
Rev: _surfaces viral/wholesome/quirky content_
Avatar: "This one's pretty wild..."
↓
Share with friend (built-in share)
↓
Close app, feel entertained

```

---

## Emotional Design Notes

### The Avatar Should Feel Like...

- **A smart friend** - not a search engine
- **Genuinely curious** - asks follow-up questions
- **Emotionally aware** - reacts to tone of content
- **Helpful but not pushy** - offers, doesn't nag
- **Occasionally funny** - deadpan humor, dad jokes

### Voice Tone

- Conversational, not robotic
- Brief - no walls of text
- Confident but not arrogant
- Warm, not clinical

### Color/Visual Language

- **Dark mode default** (easy on eyes for reading)
- **Accent colors by sentiment**:
  - Green: positive/positive news
  - Orange: concerning/neutral
  - Red: urgent/negative
  - Purple: AI/thinking states
  - Blue: informational

---

## Competitive Differentiation

| Feature | Chrome | ChatGPT | TheRev |
|---------|--------|---------|--------|
| Voice control | ❌ | ❌ | ✅ |
| Local AI (default) | ❌ | ❌ | ✅ |
| Web browsing | ✅ | ❌ | ✅ |
| Avatar companion | ❌ | ❌ | ✅ |
| Emotional reactions | ❌ | ❌ | ✅ |
| Private by default | ❌ | ⚠️ | ✅ |
| Content memory | ❌ | ✅ | ✅ |
| API key option | ❌ | N/A | ✅ |

**The Rev is the only app that combines: local AI + voice + browsing + emotional companion**

**Privacy-first by default, premium AI if they choose**

---

## MVP Feature Priority

### Must Have (Week 1)

- [x] Voice input works
- [x] Navigation is instant
- [x] AI context loads async
- [ ] Avatar reactions to content
- [ ] Privacy indicator visible
- [ ] Demo flow polished

### Should Have (Week 2)

- [ ] Continuous voice mode
- [ ] Avatar emotions (happy, sad, concerned, excited)
- [ ] Session memory (last few exchanges)
- [ ] Better onboarding flow

### Nice to Have (Week 3+)

- [ ] Wake word detection
- [ ] User interest tracking
- [ ] Article comparison lists
- [ ] Share to social
- [ ] Reading list with reminders

---

## The One-Line Pitch

> **"TheRev: Browse the web with your privacy-first AI companion who reacts to content alongside you."**

---

## Naming / Taglines

**TheRev = THE REVOLUTION**

This isn't just a name - it's a movement.

**Core Positioning:**
> "Understand the world. Simple."

**Full Name:**
- **TheRev** - The Revolution starts with understanding

**Taglines:**
- "Understand the world. Simple."
- "AI for everyone, not just tech people."
- "The revolution starts with understanding."
- "We break it down. You decide."
- "Smart news for real people."
- "Meet your AI companion for the real world."
- "The Revolution starts here."

**The Pitch (for demos):**
```

The Rev gives everyone access to AI-powered understanding.

Not just for tech people.
Not just for news junkies.
For EVERYONE.

Simple explanations.
Community support.
Real action.

The revolution is information.
We're making it accessible.

```

---

## Social Media - Right Way to Do It

### What We're NOT Building

❌ Twitter clone
❌ Follower count obsession
❌ Infinite scroll
❌ Engagement farming
❌ Viral content algorithm

---

### What We ARE Building

**Social = Shared Browsing Discovery**

The idea: "See what others are discovering with their AI companions"

---

### Social Features to Keep

✅ **Profiles**
- Avatar (visual identity - this is huge)
- Recent threads participated in
- Shared discoveries (articles the avatar reacted to)
- Visit others' profiles, see their avatar + activity

✅ **Threads**
- Participate in discussions
- AI can assist responses
- Contextual to browsing content

✅ **Feed**
- Shared articles
- Avatar reactions
- Discoveries from people you follow

✅ **Basic Interactions**
- Follow (see their activity)
- Comment on threads
- Share what you're exploring

---

### What to Simplify/Remove

❌ Follower/following counts (creates anxiety)
❌ Like/retweet metrics (vanity, not value)
❌ Infinite scroll (addicting, not helpful)
❌ Random trending (noise)
❌ Algorithmic manipulation

---

### Why Avatar as Social Identity is POWERFUL

Instead of:
```

@username123
Profile pic: generic
Bio: "I like tech"

```

We have:
```

[Visual avatar with personality]
Behavior: How they interact, what they react to
Memory: What they've explored together

```

**People recognize each other by avatar personality, not username.**

---

### The Social Experience Flow

```

User reads article about AI layoffs

Avatar: 😬 "This is concerning..."

User clicks "Share"

Post becomes:
"😬 Rev thinks this trend is concerning"
[Article preview]
[User comment]

OR:

Thread: "New EV battery breakthrough"

User A: "Is this actually viable?"

User B: "Rev says production cost is still high"

Avatar jumps in:
"From what I found, scaling is the main issue..."

👉 AI is part of the conversation

```

---

### Profile Page Mockup

```

┌─────────────────────────────────────────────┐
│ [Avatar Animation] │
│ │
│ Brandon's Rev │
│ "Always hunting for tech breakthroughs" │
│ │
│ Interests: AI, EVs, Space Tech │
│ (inferred from browsing behavior) │
├─────────────────────────────────────────────┤
│ Recent Activity │
│ │
│ 📰 Shared: "Tesla battery tech..." │
│ Rev: 🤔 "Interesting approach..." │
│ │
│ 💬 Thread: "Nuclear fusion update" │
│ 3 replies, last 2h ago │
│ │
│ 📰 Shared: "Mars rover discoveries" │
│ Rev: 😮 "This is huge..." │
└─────────────────────────────────────────────┘

```

---

### Positioning Shift

**Not:** "Social media with avatars"

**This:** "See what others are discovering with their AI companions"

---

_Last Updated: 3/26/26_
_Next Session: Start prototyping avatar emotions_
_Priority: Hook #1 (Avatar Reactions) + Hook #5 (Demo Polish)_

## Avatar Animations (3/26/26)

### Current State

**25 VRMA animations** in `src/electron/frontend/animations/`:
- Idles: StandardIdle, Bored, OffensiveIdle
- Dances: bling_dance, cat_dance, devil_dance, Rumba, Capoeira
- Actions: Walk, Jogging, Wave, Pointing, Shoot
- Reactions: Heaven/Hell, Stretch, Spin, etc.

### Animation Converter

Created `src/electron/convert-animation.js` - converts FBX directly to VRMA.

**Run:** `npm run convert:animation`

### Mixamo → VRMA Pipeline

```

Step 1: Download from Mixamo
↓ Download FBX (no skin, 30 FPS)

Step 2: Convert FBX → VRMA
↓ npm run convert:animation

Step 3: Place in animations folder
↓ Auto-loads on app restart

````

### Usage

```bash
# Basic - saves to animations folder with same name
npm run convert:animation "C:\Downloads\happy.fbx"

# Specify output location
npm run convert:animation "C:\Downloads\happy.fbx" "src\electron\frontend\animations\Happy.vrma"
````

### Recommended Animations to Download

**Emotions (for reactions):**

- Happy
- Sad
- Confused
- Excited
- Thinking
- Disappointed

**Body Language:**

- Pointing
- Waving
- Shrugging
- Arms crossed
- Thumbs up

**Idle Variations:**

- Listening
- Bored
- Curious

### Mixamo Download Settings

- Format: **FBX**
- Skin: **Without Skin** (we only need animation)
- FPS: **30** (recommended)
- Animation Type: Search for emotions, gestures, idle

### Animation Naming Convention

Name files to describe emotion/action:

- `Happy.vrma` ✅
- `Thinking.vrma` ✅
- `Confused.vrma` ✅
- `mixamo_anim_0045.fbx` ❌

---

## Future Feature Ideas

**Pitch**: "TheRev Browser - Your data stays YOUR data. No Google tracking. No Pentagon backdoors. No selling your browsing habits to advertisers."

**Option 1: Privacy-Hardened Chromium (Quick Win)**

- Configure Electron's built-in Chromium for privacy by default
- Strip tracking headers, block third-party cookies
- Clear all data on app close
- ~20 lines of config, marketable immediately

**Option 2: Tor Integration (Stronger Pitch)**

- Route traffic through Tor network
- True anonymity, encrypted, no IP exposure
- Packages: `tor-control`, `node-tor`
- Pitch: "Built-in Tor protection for true privacy"

**Option 3: Custom Chromium Build (Big Project)**

- Rebuild Chromium without Google services
- Significant effort but 100% private
- Could become separate product

**Status**: Parked for later. Strong differentiator for user acquisition.

---

## Code Review Discussion (3/26/26)

### External Review Feedback

A ChatGPT code review recommended:

- Split into microservices
- Add Kafka/RabbitMQ
- Multiple databases (Elasticsearch + Vector DB + Pinecone)
- GCP Cloud Run deployment

### Our Response

Rejected most of it because:

- **Microservices** - solo dev, not at that scale yet
- **Kafka** - overkill for our use case (RSS, YouTube, AI)
- **Multiple DBs** - Postgres + pgvector + Ollama is sufficient
- **Cloud-first** - we're a desktop app with local AI, not SaaS

### ChatGPT's Retort

Fair pushback. Acknowledged we have:

- Typed error classes (Auth, Validation, etc.)
- Centralized ErrorHandler with 40+ helpers
- 132 places using it across codebase

But pointed out the **difference between structure and behavior**:

**Structure (we have):**

- Classes, types, helpers
- Organization

**Behavior (needs work):**

- Are errors surfaced correctly to users?
- Do async flows fail gracefully?
- Do partial failures recover or silently die?
- Are timeouts handled cleanly?

### Assessment

We are operating at **early senior / startup engineer level**:

- Making correct tradeoffs
- Pushing back on bad advice
- Thinking about product impact

### Real Priorities Now

Not: "add try/catch"

But: "make the product feel undeniable"

Focus areas:

1. **User-facing errors** - clean, actionable messages
2. **Partial failures** - ingestion, AI recover gracefully
3. **Timeouts** - Ollama, APIs fail cleanly
4. **Retries** - network failures retry

---

## Error Handling - Behavioral Audit (3/26/26)

### TODO: Shore Up Error Behavior

**User-Facing Errors**

- [ ] Check how errors surface in UI (clean messages vs stack traces)
- [ ] Separate user messages from internal logs
- [ ] Test: what does user see when Ollama times out?

**Async/Partial Failures**

- [ ] RSS feed failure - does it silently die or show error?
- [ ] YouTube API failure - graceful degradation?
- [ ] AI context fetch fails - user sees something?

**Timeouts**

- [ ] Ollama 30s timeout - what happens to user?
- [ ] STT server timeout - feedback to user?
- [ ] Browser navigation timeout - handled?

**Recovery**

- [ ] Network retry logic exists?
- [ ] Partial ingestion - resume or restart?

### Test Flow

1. User says "search YouTube for X"
2. Navigate instantly (sync)
3. AI context fetches async
4. **What if AI fails?** → User sees navigation, no context. Is there an error message?
5. **What if timeout?** → Silent failure or user feedback?

### Key Files to Check

| File                                    | Concern                    |
| --------------------------------------- | -------------------------- |
| `src/index.ts`                          | API error handling         |
| `src/ai/OllamaAdapter.ts`               | Timeout behavior           |
| `src/electron/frontend/ai-browser.html` | User-facing error messages |
| `src/ingestion/*`                       | Feed failure handling      |

### FIXED (3/26/26)

**1. AI Context Fetch - Silent Failure → User Feedback**

- Was: Just logged to console, user never knew
- Now: Shows "Generating context..." thinking indicator
- If fails: Silently fails (intentional - navigation succeeded, that's what matters)

**2. Main Error Handler - Generic Message → Friendly Messages**

- Was: "Sorry, I encountered an error: " + technical message
- Now: User-friendly messages based on error type:
  - Timeout: "That took too long. The AI might be busy - please try again."
  - Network: "Couldn't reach the server. Check your connection and try again."
  - Generic: "Something went wrong. Please try again."

**3. Navigation Errors**

- Already working - shows in status bar with red error indicator

### Still TODO

- [ ] Test: What happens when Ollama times out during AI context fetch?
- [x] Add retry logic for transient failures ✅ Done
- [ ] Check RSS/YouTube ingestion failure handling
- [ ] Add error tracking/metrics (optional for MVP)

### Retry Logic Added (3/26/26)

**Added `fetchWithRetry()` helper:**

- Exponential backoff: 1s, 2s delays between retries
- Only retries network errors (not HTTP errors)
- Used in `fetchContextAsync()` for AI context fetch

**Why this matters:**

- Network blips happen - one retry often fixes it
- User doesn't see errors, just faster responses
- Doesn't retry forever (max 2 retries = ~3s extra wait)

---

## Revised MVP Priority (Post-Review)

### MUST HAVE (Week 1) - SIMPLIFY

- [ ] **Avatar reactions - FIRST thing user sees** (not a feature, the product)
- [ ] **Simplified onboarding - 60 seconds max**
- [ ] Voice input works (optional, not required)
- [ ] Navigation is instant
- [ ] AI context loads async (with retry)
- [ ] Privacy indicator visible
- [ ] Demo flow that creates the "Oh, this is different" moment

### SHOULD HAVE (Week 2)

- [ ] Avatar emotions (subtle, not constant - companion with timing)
- [ ] Session memory (last few exchanges)
- [ ] Personality - slight humor, consistent tone
- [ ] Error handling polished (user-friendly messages)

### NICE TO HAVE (Week 3+) - DELAY

- [ ] Continuous voice mode
- [ ] Wake word detection
- [ ] User interest tracking
- [ ] API key setup (privacy explanation first)
- [ ] All settings/features (but keep accessible)

### What to Focus On (NOT "Hide")

**Key insight:** Don't hide implemented features. Simplify the first experience.

**Day 1 Focus:**

- ✅ Avatar (main focal point)
- ✅ One reaction (shows the magic)
- ✅ One voice command (easy demo)
- ✅ Feed simplified (no clutter)

**Day 1 De-emphasize:**

- ⚠️ Settings (exists but collapsed)
- ⚠️ Voice mode (optional toggle, not forced)
- ⚠️ API key (settings > advanced)
- ⚠️ Tutorial (no forced onboarding walkthrough)

**The difference:**

- ❌ "Hiding" = Features don't work until unlocked
- ✅ "Simplifying" = Everything works, main experience is focused

---

## The One Thing to Get Right

**🎯 The Magic Moment:**

```

User opens app
↓
Sees article
↓
Avatar reacts + explains
↓
User feels: "Oh… this is different"

```

**If that moment works:** You win
**If it doesn't:** Nothing else matters

---

## Final Verdict (from Review)

> "You are thinking like a product builder, making smart tradeoffs, building something differentiated. You need to: simplify the experience, sharpen the first impression, avoid gimmicks, double down on emotion."
>
> "This is the closest you've been to something that could actually hit."

---

_Last Updated: 3/26/26_
_Next Session: Design the first 60 seconds onboarding + avatar reaction prototype_

## Avatar Reaction System - Connected (3/26/26)

### What Was Done

**Avatar reaction code existed but wasn't connected:**

1. `sentimentAnalyzer` - Analyzes text for emotions (happy, sad, concerned, excited, etc.)
2. `triggerAvatarReaction()` - Plays matching animation based on emotion
3. `availableChatAnimations` - Array of loaded animations

**Missing piece:** These functions were never called when AI responses arrived.

### What Was Connected

Added calls to `triggerAvatarReaction()` in three places:

1. **User sends message** (`sendMessage()`)
   - Analyzes user's message sentiment
   - Avatar reacts with matching emotion after 500ms delay

2. **AI responds** (`sendMessage()`)
   - Analyzes AI response sentiment
   - Avatar reacts to AI's tone

3. **AI context arrives** (`fetchContextAsync()`)
   - Analyzes context sentiment
   - Avatar reacts to contextual information

### Emotion to Animation Mapping

| Emotion   | Animations                              |
| --------- | --------------------------------------- |
| happy     | Victory, Cheering, Bling Dance          |
| sad       | Sitting Disapproval, Sitting Talking    |
| concerned | Strong Gesture, Taunt Gesture, Thinking |
| excited   | Victory, Cheering, Hip Hop Dancing      |
| shocked   | Taunt, Taunt Gesture, Surprised         |
| confused  | Thinking, Male Standing Pose            |
| angry     | Taunt, Taunt Gesture, Boxing            |
| hopeful   | Victory, Standing Clap, Cheering        |
| neutral   | Standard Idle, Bored, Idle Dance        |

### UI Enhancement

Added `updateEmotionDisplay()` function:

- Shows emoji badge on avatar section
- Badge shows current emotion (😊 😢 🤔 🤩 😱 😕 😠 🤞 😐)
- Fades after 5 seconds

### Files Updated

- `src/electron/frontend/ai-browser.html`
  - Added sentiment analysis call in `sendMessage()` (user & AI)
  - Added sentiment analysis call in `fetchContextAsync()`
  - Added `updateEmotionDisplay()` function
  - Added emotion emoji mapping

### Testing Flow

1. User searches "what is climate change"
2. Navigate instantly
3. AI context fetched
4. Sentiment analyzed → Emotion detected
5. Avatar plays matching animation
6. Emotion badge shows emoji

---

## Social Features Epic - MVP Stack (3/31/26)

> "A place where information becomes conversations, and conversations become understanding."

### Core Differentiator Stack

**AI + Avatars + News Threads**

---

# EPIC 1: Perspective Threads

**"Multi-angle conversations that reduce chaos and encourage structured thinking"**

## Overview

Instead of one flat comment feed, threads are split into perspectives. Users tag their replies as Pro, Against, Neutral, or AI. This opens our own lane - structured discussions instead of endless comment wars.

## User Stories

### Story 1.1: Perspective Selection on Reply

**As a** user replying to a thread  
**I want to** select my perspective (Pro/Against/Neutral) when posting  
**So that** my stance is clear and readers can filter by viewpoint

**Acceptance Criteria:**

- [ ] Reply form has perspective selector: "🟦 Pro", "🟥 Against", "🟨 Neutral"
- [ ] Default perspective is "Neutral"
- [ ] Perspective badge shows next to author's reply
- [ ] Cannot change perspective after posting

**Technical Notes:**

- Add `perspective` field to Post entity: `PRO | AGAINST | NEUTRAL`
- Update Post resolver to accept perspective input
- Frontend: Add perspective selector buttons above reply form

### Story 1.2: Thread View with Perspective Groups

**As a** user viewing a thread  
**I want to** see posts grouped by perspective  
**So that** I can quickly read all pro or all against arguments

**Acceptance Criteria:**

- [ ] Thread view shows tabs/sections: "All" | "🟦 Pro" | "🟥 Against" | "🟨 Neutral"
- [ ] Active tab highlights current filter
- [ ] Count badge shows number of posts per perspective
- [ ] Default view is "All"

**Technical Notes:**

- Frontend: Tab navigation with post filtering
- Backend: Add filter by perspective to posts query
- UI: Show perspective color indicators on post cards

### Story 1.3: AI Auto-Summary Perspective

**As a** user reading a thread  
**I want to** see an AI-generated summary that synthesizes all perspectives  
**So that** I can quickly understand the key points without reading everything

**Acceptance Criteria:**

- [ ] Thread shows "🧠 AI Summary" section at top
- [ ] Summary auto-generates when thread has 3+ posts
- [ ] Summary updates as new posts are added
- [ ] Summary highlights key pro and against arguments

**Technical Notes:**

- Trigger AI summary when: post count >= 3 OR 1 hour after thread creation
- Use Ollama/Claude to generate neutral summary
- Store summary in Thread.metadata
- Re-generate on significant new activity

### Story 1.4: Perspective Filter Toggle

**As a** user with limited time  
**I want to** filter to only see posts matching a specific perspective  
**So that** I can quickly find arguments I agree with or want to challenge

**Acceptance Criteria:**

- [ ] Toggle buttons for each perspective
- [ ] Can select multiple perspectives (e.g., Pro + Neutral)
- [ ] Filter persists during session
- [ ] Clear filter button to show all

**Technical Notes:**

- Frontend state management for active filters
- GraphQL query accepts `perspectives: [Perspective]` filter
- URL param sync for shareable filtered views

### Story 1.5: Thread Creation with Initial Perspective

**As a** user creating a thread about a topic  
**I want to** optionally set an initial perspective tag  
**So that** readers know what angle the thread starts from

**Acceptance Criteria:**

- [ ] Thread creation form has "Starting Perspective" selector
- [ ] Options: "Open Discussion", "Pro-focused", "Against-focused", "Question/Neutral"
- [ ] Tag shows as badge on thread in list view
- [ ] Does not restrict what perspectives can reply

**Technical Notes:**

- Add `initialPerspective` to Thread entity
- Update thread creation mutation
- Show perspective badge in thread cards

## Files to Create/Modify

| File                               | Changes                            |
| ---------------------------------- | ---------------------------------- |
| `src/entities/Post.ts`             | Add `perspective` field            |
| `src/entities/Thread.ts`           | Add `initialPerspective` field     |
| `src/graphql/enums/Perspective.ts` | Create enum: PRO, AGAINST, NEUTRAL |
| `src/resolvers/Post.ts`            | Accept perspective in createPost   |
| `src/models/posts.model.ts`        | Store perspective                  |
| `src/dao/posts.dao.ts`             | Filter by perspective              |
| `src/electron/frontend/app.js`     | Perspective UI components          |
| `src/electron/frontend/styles.css` | Perspective styling                |

---

# EPIC 2: Living Posts (HIGH-ENGAGEMENT ONLY)

**"Threads that evolve with AI updates, but only when they deserve it"**

## Overview

Posts aren't static snapshots - they can evolve with AI-generated summaries. **BUT** this only happens for threads that hit engagement thresholds. Random low-activity threads stay simple. This is smart resource allocation.

## 🚨 CRITICAL: LITE VERSION FOR MVP

**Ship only these for MVP:**

- `isTrending` boolean on Thread
- One AI summary when thread becomes trending
- "🔬 Trending" badge

**Defer to Phase 2+:**

- ❌ Continuous background updates
- ❌ Real-time source linking
- ❌ Opposing viewpoints
- ❌ Timeline view
- ❌ Complex state machine (living → cooling → dead → revived)

**Why:** Background jobs, race conditions, and cost explosion are real risks. Ship the lean version first.

## Engagement Thresholds

| Metric           | Threshold to Become "Trending" |
| ---------------- | ------------------------------ |
| Engagement Score | 50+                            |

**Score formula:** `(posts * 2) + (uniqueUsers * 3)`

**Once trending, stays trending until score drops below 25 for 24 hours.**

## User Stories (LITE MVP)

### Story 2.1: Trending Thread Detection (MVP)

**As a** system  
**I want to** identify threads that are gaining traction  
**So that** I can show a trending badge

**Acceptance Criteria:**

- [ ] Background job checks thread metrics every 5 minutes
- [ ] Thread becomes trending when engagement score > 50
- [ ] Thread gets "🔬 Trending" badge when activated
- [ ] Badge removed when score drops below 25

**Technical Notes:**

- Add `isTrending` boolean to Thread entity
- Simple job, no complex state machine yet

### Story 2.2: AI Auto-Summary (One-Time, MVP)

**As a** user reading a trending thread  
**I want to** see an AI-generated summary  
**So that** I can quickly understand the discussion

**Acceptance Criteria:**

- [ ] Trending threads show "🧠 AI Summary" section at top
- [ ] Summary generated ONCE when thread becomes trending
- [ ] Summary highlights key pro and against arguments
- [ ] Shows "Generated on [date]" timestamp

**Technical Notes:**

- Trigger: when thread becomes trending
- Generate once, store in Thread.metadata
- **NOT continuous updates for MVP**
- Use Ollama for local inference

### Story 2.3: Trending Badge Display (MVP)

**As a** user browsing threads  
**I want to** identify trending threads at a glance  
**So that** I can prioritize high-engagement discussions

**Acceptance Criteria:**

- [ ] Trending threads show "🔬 Trending" badge
- [ ] Badge shows in thread list
- [ ] Non-trending threads show no badge

**Technical Notes:**

- Simple boolean check
- Badge component in thread cards

## Future Stories (Phase 2+)

These are valuable but not MVP:

- **Story 2.4**: Continuous updates (complex, costs money)
- **Story 2.5**: Source linking (complex, rate limits)
- **Story 2.6**: Opposing viewpoints (AI costs)
- **Story 2.7**: Timeline view (complex)
- **Story 2.8**: Complex state machine (living → cooling → revived)

## Files to Create/Modify (LITE)

| File                              | Changes                              |
| --------------------------------- | ------------------------------------ |
| `src/entities/Thread.ts`          | Add `isTrending`, `aiSummary` fields |
| `src/services/TrendingTracker.ts` | Create simple engagement tracker     |
| `src/worker.ts`                   | Add trending check job (simple)      |
| `src/electron/frontend/app.js`    | Trending badge UI                    |

---

# EPIC 3: AI Co-Posting

**"Lower the friction for thoughtful content - AI helps users articulate their thoughts"**

## Overview

Users have ideas but struggle to articulate them well. AI helps draft structured, thoughtful posts that users can edit and publish. This increases content quality and posting frequency.

## User Stories

### Story 3.1: AI Draft Assistant

**As a** user with a rough idea  
**I want to** have AI help me structure my thought  
**So that** I can post more articulate, thoughtful content

**Acceptance Criteria:**

- [ ] "Draft with AI" button in thread creation
- [ ] User enters rough notes/keywords
- [ ] AI generates structured draft
- [ ] User edits draft before posting

**Technical Notes:**

- New endpoint: `POST /api/ai/draft-post`
- Input: `{ topic, tone, perspective }`
- Output: Structured draft text
- Use Ollama for local inference

### Story 3.2: Perspective-Based Drafting

**As a** user wanting to contribute a specific viewpoint  
**I want to** AI generate a draft matching my perspective  
**So that** my argument is clear and well-structured

**Acceptance Criteria:**

- [ ] Draft assistant shows perspective selector
- [ ] AI generates pro/against/neutral versions
- [ ] User can switch between versions
- [ ] Preview shows how post will appear

**Technical Notes:**

- Extend draft endpoint: `{ topic, tone, perspective, context }`
- Generate 2-3 sentence paragraph + supporting points
- Show character count

### Story 3.3: Thread Context Injection

**As a** user replying to an existing thread  
**I want to** AI read the thread and help me craft my response  
**So that** my reply is informed and adds value

**Acceptance Criteria:**

- [ ] Reply form shows "Get AI help" option
- [ ] AI summarizes thread context
- [ ] Suggests points not yet covered
- [ ] Helps structure counterargument if opposing

**Technical Notes:**

- Fetch recent posts from thread
- AI generates context summary
- Suggest points based on what existing posts covered
- Do NOT auto-generate full reply (user must write)

### Story 3.4: Tone Adjustment

**As a** user who wrote a post but feels it's too aggressive  
**I want to** have AI suggest more constructive phrasing  
**So that** my post encourages discussion, not fights

**Acceptance Criteria:**

- [ ] "Adjust Tone" button on draft posts
- [ ] Options: More Diplomatic, More Assertive, More Curious
- [ ] Shows side-by-side comparison
- [ ] User picks version or edits further

**Technical Notes:**

- Use AI to rephrase while preserving meaning
- Highlight specific changed phrases
- Track tone adjustment count (flag if > 3)

### Story 3.5: Post Quality Scoring

**As a** user wanting feedback on my posts  
**I want to** see a quality score before publishing  
**So that** I can improve before going live

**Acceptance Criteria:**

- [ ] Draft shows "Quality Score" indicator
- [ ] Score based on: length, clarity, sources, perspective clarity
- [ ] Suggestions to improve score
- [ ] Score is informational, not blocking

**Technical Notes:**

- Scoring criteria:
  - Length: 100-500 chars = good, <50 or >2000 = low
  - Sources: Has URLs = bonus
  - Perspective: Clear stance = bonus
  - Grammar: No obvious errors
- Display as: "Quality: 72/100"

## Files to Create/Modify

| File                           | Changes                             |
| ------------------------------ | ----------------------------------- |
| `src/index.ts`                 | Add `/api/ai/draft-post` endpoint   |
| `src/ai/AIDraftService.ts`     | Create service for draft generation |
| `src/ai/PostQualityService.ts` | Create service for quality scoring  |
| `src/electron/frontend/app.js` | Co-posting UI components            |

---

# EPIC 4: Heat & Relevance Scoring

**"Content that cools down - fight infinite-scroll addiction with natural decay"**

## Overview

Instead of engagement-maximizing algorithms, threads have a natural lifecycle. They heat up when active and cool down over time. The AI highlights what mattered, and only meaningful content survives. This is the anti-doomscroll.

## User Stories

### Story 4.1: Thread Heat Indicator

**As a** user browsing threads  
**I want to** see a heat/temperature indicator  
**So that** I can prioritize active discussions

**Acceptance Criteria:**

- [ ] Thread cards show heat bar/thermometer
- [ ] Colors: 🔴 Hot (just created), 🟠 Warming (recent activity), 🔵 Cooling (older), ⚪ Cold (settled)
- [ ] Tooltip shows "X posts in last hour"
- [ ] Heat calculated from post rate + engagement

**Technical Notes:**

- Heat formula: `(recentPosts * 3) + (recentComments * 1) + (views * 0.1)`
- Thresholds: Hot > 50, Warming 20-50, Cooling 5-20, Cold < 5
- Recalculate every 5 minutes

### Story 4.2: Automatic Thread Cooling

**As a** user interested in a topic that settled  
**I want to** see the thread marked as "cooled"  
**So that** I'm not pressured to engage with old content

**Acceptance Criteria:**

- [ ] Threads auto-cool after 48 hours without significant activity
- [ ] Cooled threads show "📋 Summary" instead of live feed
- [ ] Summary auto-generated by AI
- [ ] "Reheat" button to reactivate

**Technical Notes:**

- Background job checks for cooled threads daily
- AI summary generated from top posts
- Thread state: ACTIVE, COOLING, COOLED, REHEATED

### Story 4.3: AI Thread Summary

**As a** user browsing a cooled thread  
**I want to** read an AI summary of what happened  
**So that** I understand the discussion without reading 200 posts

**Acceptance Criteria:**

- [ ] Cooled threads show AI summary at top
- [ ] Summary highlights: main arguments, consensus reached, key facts
- [ ] "Read full discussion" expands thread
- [ ] Summary shows "Generated X hours ago"

**Technical Notes:**

- Generate summary when thread cools
- Summary stored in Thread.metadata
- Include perspective breakdown in summary

### Story 4.4: Reheat Mechanism

**As a** user who wants to revive a discussion  
**I want to** "reheat" a cooled thread  
**So that** fresh perspectives can be added

**Acceptance Criteria:**

- [ ] "🔥 Reheat" button on cooled threads
- [ ] User adds new post to reheat
- [ ] Thread moves back to active
- [ ] Reheat adds note: "Revived by [user]"

**Technical Notes:**

- Reheat requires new post
- Thread state becomes ACTIVE
- Add "revived" badge for 24 hours

### Story 4.5: Feed Respecting Thread State

**As a** user who doesn't want infinite scroll  
**I want to** see clear thread state in my feed  
**So that** I know what to engage with vs. what to skip

**Acceptance Criteria:**

- [ ] Feed shows "Active Discussions" section first
- [ ] "Settled" section after with clear visual break
- [ ] Cooled threads show summary preview
- [ ] User can collapse settled section

**Technical Notes:**

- GraphQL query returns threads sorted by state, then heat
- Frontend sections: Active | Cooling | Cooled
- Persist collapse state in localStorage

## Files to Create/Modify

| File                                     | Changes                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `src/entities/Thread.ts`                 | Add `heatScore`, `state`, `summary` fields     |
| `src/graphql/enums/ThreadState.ts`       | Create enum: ACTIVE, COOLING, COOLED, REHEATED |
| `src/services/HeatCalculationService.ts` | Create service for heat scoring                |
| `src/services/ThreadSummaryService.ts`   | Create service for AI summaries                |
| `src/worker.ts`                          | Add cooling job                                |
| `src/electron/frontend/app.js`           | Heat UI, section filtering                     |

---

# EPIC 5: Avatar-Driven Social Layer

**"Make avatars functional, not cosmetic - they represent users and facilitate discussions"**

## Overview

Avatars aren't just visual identity - they're functional. They speak, react, summarize, and represent users in discussions. This is the sleeper advantage that neither Reddit nor Instagram touches.

## User Stories

### Story 5.1: TTS Only (Phase 1)

**As a** user who prefers listening over reading  
**I want to** hear posts read aloud  
**So that** I can consume content hands-free

**Acceptance Criteria:**

- [ ] "🔊 Listen" button on posts and thread summaries
- [ ] Uses Web Speech API (existing implementation)
- [ ] Speed control: 0.75x, 1x, 1.25x
- [ ] Avatar simple mouth animation (open while speaking)

**Technical Notes:**

- Use existing TTS implementation - NO new APIs
- Queue management for multiple "listen" requests
- Simple animation: mouth open when speaking, closed when paused
- **Lip sync (phoneme-based) = Phase 3, not MVP**

**Phases:**

- Phase 1 (NOW): Simple mouth open/close
- Phase 2 (Later): Better mouth shapes
- Phase 3 (Future): Real phoneme-based lip sync

### Story 5.2: Avatar Reaction Summary

**As a** user scanning a thread  
**I want to** see avatar reaction summary at top  
**So that** I quickly understand the emotional temperature

**Acceptance Criteria:**

- [ ] Thread shows "Avatars are feeling..." summary
- [ ] Emoji reactions: 😰 Concerned (30%), 😠 Angry (20%), 🤔 Thinking (50%)
- [ ] Click to see breakdown by user
- [ ] Based on avatar sentiment analysis

**Technical Notes:**

- Each user's avatar has sentiment state
- Aggregate sentiment from recent activity
- Display as stacked emoji bar

### Story 5.3: Async Avatar Debate Replay

**As a** user short on time  
**I want to** have avatars summarize the debate for me  
**So that** I understand key points without reading everything

**Acceptance Criteria:**

- [ ] "🔊 Summarize Debate" button on perspective threads with 5+ posts
- [ ] Pro avatar speaks pro summary (30 seconds)
- [ ] Against avatar speaks against summary (30 seconds)
- [ ] Neutral avatar gives final summary
- [ ] Simple mouth open/close animation during speech
- [ ] "Skip" button to stop playback

**Technical Notes:**

- **NOT real-time** - this is async playback
- Generate debate summary from top 3 pro/against posts
- Script pre-generated, no WebRTC needed
- Use existing TTS (Web Speech API)
- Simple animation: mouth opens on speech, closes on pause
- **This is the "viral moment" - keep it simple and reliable**

**Why Async vs Real-Time:**

- ❌ Real-time: Latency kills it, WebRTC complex, voice sync hard
- ✅ Async: Pre-generated, reliable, 30-60 sec duration, works every time

### Story 5.4: Avatar Presence in Profile

**As a** user viewing someone's profile  
**I want to** see their avatar animate and introduce them  
**So that** Profiles feel more personal than static pages

**Acceptance Criteria:**

- [ ] Profile page shows animated avatar
- [ ] Avatar introduces user: "Hi, I'm [name]'s Rev!"
- [ ] Shows recent discussion highlights
- [ ] Avatar reflects user's typical sentiment

**Technical Notes:**

- Fetch user sentiment average from posts
- Avatar plays matching idle animation
- TTS intro generated from username + interests

### Story 5.5: Voice Post Creation

**As a** user who prefers speaking over typing  
**I want to** record a voice post  
**So that** My thoughts are captured authentically

**Acceptance Criteria:**

- [ ] "🎙️ Voice Post" option in thread creation
- [ ] Record button with waveform visualization
- [ ] Preview before posting
- [ ] Transcript shown alongside (optional)

**Technical Notes:**

- Web Speech API for recording
- Whisper STT for transcription
- Store as audio blob + optional transcript
- **This is Phase 3, not MVP - deprioritize**

**Why Defer:**

- Nice to have, not core differentiator
- Browser APIs inconsistent for recording
- Whisper integration adds complexity
- Focus on core features first

## Files to Create/Modify

| File                                  | Changes                                  |
| ------------------------------------- | ---------------------------------------- |
| `src/entities/User.ts`                | Add `avatarSettings`, `defaultSentiment` |
| `src/electron/frontend/app.js`        | Voice post UI, avatar debate             |
| `src/services/AvatarDebateService.ts` | Create service for debate generation     |
| `src/ai/TTSService.ts`                | Create/extend for avatar speech          |

---

# 🚨 Strategic Feedback Incorporated (3/31/26)

## Critical Lessons from Review

### Risky / Harder Than They Look

| Feature                 | Risk                                                        | Lean Version                                                                                        |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Avatar Debate**       | Real-time sync, lip sync, latency kills UX                  | Async "Debate Replay" - AI summarizes both sides, avatars take turns speaking (scripted, 30-60 sec) |
| **Living Posts**        | Background jobs, AI costs, race conditions, cost explosion  | Lite version: `isTrending` boolean + one AI summary only                                            |
| **Voice + Avatar Sync** | Lip sync hard, browser APIs inconsistent, voice consistency | Phase 1: TTS only. Phase 2: Simple mouth open/close. Phase 3: Real lip sync later                   |
| **AI Everywhere**       | Gimmicky if overused, slows UX, costs stack up              | **Ruthlessly prioritize** - only where it creates "oh shit this is different"                       |
| **Too Many Systems**    | Team-sized scope                                            | Ship tight, undeniable core first                                                                   |

### What Is VERY Solid (Lean Into This)

| Feature                      | Why It Works                                                           |
| ---------------------------- | ---------------------------------------------------------------------- |
| 🔥 **Perspective Threads**   | Simple, clear UX difference, instant understandability, no heavy infra |
| 🔥 **Heat + Cooling System** | Fights doomscrolling, gives app philosophy, easy to implement          |
| 🔥 **Avatar Reactions**      | Already implemented, magic moment engine                               |

### Ruthless AI Prioritization

**Only keep AI where it creates "oh shit this is different":**

✅ **Keep:**

- Avatar reacting to content
- AI summary of threads

❌ **Optional later:**

- Draft assistant
- Source linking
- Voice posts
- Debate system

---

# 🎯 Lean MVP Phases

## Phase 1: MVP (2-3 weeks) - SHIP THESE ONLY

| Feature                 | Scope                                        |
| ----------------------- | -------------------------------------------- |
| **Perspective Threads** | Full implementation (select, group, filter)  |
| **Avatar Reactions**    | Already done - polish it                     |
| **Simple AI Summary**   | 1 summary per thread (no continuous updates) |
| **Basic Feed**          | Thread list with perspective badges          |

**That's it. Ship it.**

## Phase 2: If People Like It

- AI co-posting (draft assistant)
- Heat system (anti-doomscroll)
- Better avatar animations

## Phase 3: If It's Working

- Living posts (background updates)
- Async avatar debate replay
- Voice + lip sync

---

# 🔥 Refined Avatar Debate (Realistic Version)

## "Auto Debate Mode" (Async, Not Real-Time)

**User clicks**: "Summarize Debate"

**AI generates**:

- Pro argument (from top pro posts)
- Against argument (from top against posts)

**Two avatars take turns speaking**:

1. Pro avatar: "Here's the pro side..."
2. Against avatar: "Here's the counter..."
3. Neutral avatar: "In summary..."

**Duration**: 30-60 seconds total

### Why This Works

- ✅ Viral content potential
- ✅ No real-time infra needed
- ✅ Feels unique as hell
- ✅ No latency issues
- ✅ Scripted = reliable

### Technical Notes

- Generate debate summary from top 3 pro/against posts
- Script alternates between two avatar instances
- Use existing TTS (Web Speech API)
- Simple mouth animation (open/close with speech)
- **NOT real-time WebRTC** - this is playback

---

# Implementation Order (Revised)

| Epic                            | Priority | Rationale                                       |
| ------------------------------- | -------- | ----------------------------------------------- |
| **Epic 1: Perspective Threads** | 1        | Core differentiator, "this isn't Reddit" moment |
| **Epic 6: Friends & Social**    | 2        | Core social layer, enables messaging            |
| **Epic 4: Heat Scoring**        | 3        | Anti-doomscroll brand, easy to implement        |
| **Epic 5: Avatar Cutscenes**    | 4        | Hook for notifications, video game feel         |
| **Epic 2: Living Posts (LITE)** | 5        | isTrending + one summary only                   |
| **Epic 3: AI Co-Posting**       | 6        | Draft assistant, low effort                     |

---

# Quick Win Stories (Do First)

Within Epic 1 (Perspective Threads):

- **Story 1.1** (Perspective selector) + **Story 1.2** (View with groups) = MVP
- Together they form the core differentiator in ~1 day of work

Within Epic 4 (Heat Scoring):

- **Story 4.1** (Heat indicator) = purely frontend display
- No backend changes, just calculate from existing data

Within Epic 2 (Living Posts LITE):

- **Story 2.6** (isTrending badge) = just a boolean + badge
- Simple engagement check job

---

_Last Updated: 3/31/26_
_Next Session: Implement Story 1.1 (Perspective selector on reply)_

---

# 🎬 Avatar Cutscene System (NEW - 3/31/26)

## Concept

**"Video game-style notification cutscenes with TWO avatars"**

When users receive notifications, BOTH avatars appear in the scene:

- **Your avatar** (the receiver)
- **Their avatar** (the sender)

They interact in a short animated scene before revealing the content. This creates a "first 60 seconds" hook that feels like playing a game with your friends.

## The Vision

> "Every notification is a scene - you and the other person meet in your avatars"

**Examples:**

- New message → Their avatar walks up, hands you envelope, your avatar takes it and waves
- Friend request → Your avatars meet in middle, handshake/hug animation, you accept
- Thread reply → Both avatars look at floating scroll, react to content
- Achievement → Both avatars do celebration dance together

## Technical Approach

### Two-Avatar Scene Setup

```
Scene: Delivery Scene
       [Their Avatar] ──────────→ [Your Avatar]
              ↓                        ↓
         Walks forward            Stands ready
              ↓                        ↓
         Hands over item           Takes item
              ↓                        ↓
         Waves goodbye             Waves back
```

### Mixamo Animation Library (Primary Source)

**Mixamo has THOUSANDS of free animations** - no AI video generation needed.

Benefits:

- ✅ 100% Free
- ✅ High quality, professionally made
- ✅ Thousands of variations
- ✅ Reliable - no generation failures
- ✅ Mixamo.com has: walks, runs, gestures, dances, fights, sports, idle variations, etc.

**Mixamo Animation Categories Available:**

- Walks (casual, military, zombie, zombie, tiptoe, sneaking)
- Runs (sprint, jog, backwards, lateral)
- Idle (breathing, look around, check watch, stretch)
- Gestures (thumbs up, point, wave, clap, shrug)
- Dances (30+ styles)
- Fights (punches, kicks, blocks, combos)
- Sports (basketball, baseball, boxing, yoga)
- Actions (jump, sit, stand, lie down, crawl)
- Emotions (celebrate, sad, angry, excited)

### Animation Chaining Per Avatar

1. **Select relevant animations** from Mixamo library
2. **Convert to VRMA format** using existing pipeline
3. **Each user's VRM avatar** swaps onto animation skeleton
4. **Choreographed sequences** - both avatars play synchronized clips:
   ```
   Their Avatar: idle → walk_forward → reach_out → release → wave
   Your Avatar:   idle → ready_pose → reach_in → hold → wave
   ```

**No AI video generation needed** - Mixamo provides all the animations we need to create complex, engaging scenes.

### Animation Sets Needed

| Notification Type       | Animations Per Avatar | Total Clips | Duration |
| ----------------------- | --------------------- | ----------- | -------- |
| **Messages (6)**        | 4-5 per avatar        | 12 clips    | 8-10 sec |
| **Friend Requests (6)** | 3-4 per avatar        | 12 clips    | 6-8 sec  |
| **Thread Activity (6)** | 3-4 per avatar        | 12 clips    | 6-8 sec  |
| **Achievements (6)**    | 3-4 per avatar        | 12 clips    | 4-6 sec  |

### Implementation Flow

```
Notification received
       ↓
User clicks notification
       ↓
Modal overlay appears with 3D scene
       ↓
Load BOTH avatars into scene
       ↓
Cutscene plays - avatars interact (8-10 sec)
       ↓
Content revealed (message/thread/post)
       ↓
User engages
```

## Scene Types Per Notification

### Message Scenes (6 Variations)

1. **Mail Delivery**: Their avatar delivers letter, your avatar receives
2. **Package Drop**: Their avatar drops package, your avatar opens it
3. **Drone Delivery**: Futuristic drone drop animation
4. **Carrier Pigeon**: Old school message delivery
5. **Messenger Run**: Their avatar sprints in, delivers quickly
6. **Formal Delivery**: Both bow, exchange formally

### Friend Request Scenes (6 Variations)

1. **Handshake**: Both avatars meet, shake hands
2. **Gift Exchange**: Present exchange with bows
3. **Hug**: Friendly embrace animation
4. **Wave Hello**: Casual wave meeting
5. **Introduce**: One presents the other
6. **Group Wave**: Both wave together

### Thread/Post Scenes (6 Variations)

1. **Scroll Reading**: Both look at floating scroll
2. **Debate Pose**: Avatars face off respectfully
3. **Research Mode**: Both look at documents/notes
4. **Lightbulb**: One has idea, shares with other
5. **Thumbs Up**: Mutual approval exchange
6. **Discussion**: Both gesture while talking

### Achievement Scenes (6 Variations)

1. **Victory Dance**: Both do synchronized celebration
2. **Jump for Joy**: Both jump together
3. **Fist Pump**: Both pump fists
4. **Applause**: One applauds the other
5. **Trophy**: Trophy appears, both celebrate
6. **High Five**: Avatars high-five

## MVP Scope

### Phase 1: Basic Two-Avatar Cutscene Engine

- [ ] Animation sequencer that handles two avatars
- [ ] Synchronized playback (both avatars choreographed)
- [ ] Simple scene background
- [ ] Trigger system for each notification type
- [ ] 1 scene type (message delivery)
- [ ] Download 10-20 key Mixamo animations

### Phase 2: Multiple Scenes

- [ ] 6 message delivery scenes (random selection)
- [ ] 6 friend request scenes
- [ ] 6 thread activity scenes
- [ ] 6 achievement scenes
- [ ] Build full Mixamo animation library (50+ clips)

### Phase 3: Enhanced Scenes

- [ ] More complex choreographed sequences
- [ ] Dynamic scene backgrounds
- [ ] Avatar-accurate animations (animations that match avatar style)
- [ ] Sound effects synced to animations

## Already Have Infrastructure

- ✅ Three.js VRM loader (for both avatars)
- ✅ VRMAnimationLoaderPlugin (already used)
- ✅ Animation system working
- ✅ 25 VRMA animations loaded
- ✅ `npm run convert:animation` - converts FBX to VRMA

## Next Steps

1. Build two-avatar animation sequencer class
2. Download key Mixamo animations (walks, gestures, idles)
3. Convert to VRMA using existing pipeline
4. Create choreography system (which clip plays on which avatar)
5. Build notification trigger system
6. Test with 1 scene type
7. Add avatar positioning in scene

## Mixamo Download Workflow

```
1. Go to mixamo.com
2. Search for animation (e.g., "walk friendly")
3. Download FBX (without skin, 30 FPS)
4. Run: npm run convert:animation "path/to/animation.fbx"
5. Animation auto-loads into app
```

---

# EPIC 6: Friends & Social Connections

**"Build your community - connect with people who share your interests"**

## Overview

Users can add friends, view their profiles/avatars, message them directly, and see their activity. This creates a social layer around the avatar system.

## User Stories

### Story 6.1: Friend Search & Add

**As a** user  
**I want to** search for and add friends  
**So that** I can build my social network

**Acceptance Criteria:**

- [ ] Search users by username
- [ ] Send friend request
- [ ] Receive friend request notification
- [ ] Accept/decline requests
- [ ] View pending requests

**Technical Notes:**

- Add `friends` table: `userId`, `friendId`, `status` (PENDING, ACCEPTED, BLOCKED), `createdAt`
- Add endpoints: search users, send request, accept/decline, list friends

### Story 6.2: Friends List

**As a** user  
**I want to** see my friends list  
**So that** I can quickly access their profiles

**Acceptance Criteria:**

- [ ] Friends list with avatar thumbnails
- [ ] Online/offline status indicator
- [ ] Quick actions: message, view profile
- [ ] Sort by: recent, alphabetical, online first

**Technical Notes:**

- Query friends with user data
- Consider adding `lastActive` timestamp for online status

### Story 6.3: View Friend Profile

**As a** user  
**I want to** view a friend's profile  
**So that** I can see their avatar, bio, and recent activity

**Acceptance Criteria:**

- [ ] Their avatar animated on profile page
- [ ] Bio/interests displayed
- [ ] Recent posts/threads shown
- [ ] Their perspective history (pro/against/neutral)

**Technical Notes:**

- Reuse existing profile page structure
- Fetch user's recent posts from Posts table
- Show their avatar's default emotion/expression

### Story 6.4: Direct Messaging

**As a** user  
**I want to** send private messages to friends  
**So that** I can have private conversations

**Acceptance Criteria:**

- [ ] Message thread per friend
- [ ] Real-time message delivery
- [ ] Unread message count badge
- [ ] Notification cutscene when message received

**Technical Notes:**

- Add `messages` table: `id`, `senderId`, `recipientId`, `content`, `read`, `createdAt`
- GraphQL subscription for real-time
- Trigger cutscene on message receive

### Story 6.5: Friend Activity Feed

**As a** user  
**I want to** see what my friends are participating in  
**So that** I can discover new threads and discussions

**Acceptance Criteria:**

- [ ] Feed of friend's recent posts
- [ ] Their avatar reactions shown
- [ ] Click to view thread
- [ ] Option to reply from feed

**Technical Notes:**

- Query posts where author is in friends list
- Order by createdAt DESC
- Show avatar emotion with each post

### Story 6.6: Block/Unfriend

**As a** user  
**I want to** remove or block users  
**So that** I can control my social experience

**Acceptance Criteria:**

- [ ] Unfriend button on friend profile
- [ ] Block user (removes from friends, prevents future requests)
- [ ] Unblock option in settings
- [ ] Blocked users can't see your profile

**Technical Notes:**

- Status: ACCEPTED → REMOVED
- New status: BLOCKED (prevents requests)
- Add `isBlocked` field or separate block table

## Files to Create/Modify

| File                                | Changes                                       |
| ----------------------------------- | --------------------------------------------- |
| `src/entities/Friend.ts`            | Create Friend entity                          |
| `src/entities/Message.ts`           | Create Message entity                         |
| `src/models/friends.model.ts`       | Create FriendsModel                           |
| `src/models/messages.model.ts`      | Create MessagesModel                          |
| `src/resolvers/Friend.ts`           | Create Friend resolver (search, request, etc) |
| `src/resolvers/Message.ts`          | Create Message resolver                       |
| `src/electron/frontend/app.js`      | Friends UI, messaging UI                      |
| `src/graphql/enums/FriendStatus.ts` | Create enum: PENDING, ACCEPTED, BLOCKED       |

## Database Schema

```sql
-- Friends table
CREATE TABLE friend (
  id UUID PRIMARY KEY,
  requester_id UUID REFERENCES user(id),
  recipient_id UUID REFERENCES user(id),
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ACCEPTED, BLOCKED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE message (
  id UUID PRIMARY KEY,
  sender_id UUID REFERENCES user(id),
  recipient_id UUID REFERENCES user(id),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_friend_requester ON friend(requester_id);
CREATE INDEX idx_friend_recipient ON friend(recipient_id);
CREATE INDEX idx_message_sender ON message(sender_id);
CREATE INDEX idx_message_recipient ON message(recipient_id);
```

## MVP Scope

### Phase 1: Basic Friends

- [ ] Friend search and request
- [ ] Accept/decline requests
- [ ] Friends list display
- [ ] View friend profile with avatar

### Phase 2: Messaging

- [ ] Direct message thread
- [ ] Real-time message delivery
- [ ] Unread badges
- [ ] Message cutscene

### Phase 3: Polish

- [ ] Online status
- [ ] Activity feed
- [ ] Block/unfriend
- [ ] Notification on friend activity

1. Go to mixamo.com
2. Search for animation (e.g., "walk friendly")
3. Download FBX (without skin, 30 FPS)
4. Run: npm run convert:animation "path/to/animation.fbx"
5. Animation auto-loads into app

```

---

# 📋 Current Project Status (3/31/26)

## ✅ COMPLETED THIS SESSION

### UI Overhaul

- [x] Complete CSS variable system overhaul
- [x] Modern dark theme with gradients and glows
- [x] Better header with gradient logo
- [x] Improved thread cards with hover effects
- [x] Better modal styling with animations
- [x] Polished vote buttons with perspective colors
- [x] Side-by-side thumbnail layout for thread cards
- [x] Global polish (scrollbars, focus states)

### Auth/Profile

- [x] User profile pic shows in header next to sign out
- [x] Uses profilePicUrl (not avatarUrl)
- [x] Correct server URL prefix for local uploads

### Bug Fixes

- [x] Fixed duplicate ThreadVoteCounts type error
- [x] Fixed perspective tabs not working
- [x] Perspective counts simplified (detail view only)

## 🎯 NEXT PRIORITIES

### High Priority
1. **Story 1.1**: Perspective selector on reply form
2. **Story 1.2**: Thread view with perspective groups/tabs
3. **Story 6.1**: Friend search and add functionality
4. **Story 6.2**: Friends list display

### Medium Priority
5. **Story 1.4**: Perspective filter toggle
6. **Story 1.5**: Thread creation with initial perspective
7. **Story 6.3**: View friend profile with avatar
8. **Story 6.4**: Direct messaging system

### Lower Priority
9. **Cutscene Engine**: Build animation sequencer prototype
10. **Story 2.1**: Trending thread detection (isTrending boolean)
11. **Story 3.1**: AI Draft Assistant
12. **Story 5.3**: Async Avatar Debate Replay

## 📁 RELEVANT FILES

### Frontend

- `src/electron/frontend/app.js` - Main app logic, thread rendering
- `src/electron/frontend/styles.css` - All styling (5447 lines)
- `src/electron/frontend/index.html` - UI structure
- `src/electron/frontend/WhisperSpeech.js` - Voice control

### Backend (Social Features)

- `src/models/threads.model.ts` - Thread queries
- `src/models/posts.model.ts` - Post queries
- `src/dao/posts.dao.ts` - Post data access
- `src/resolvers/Thread.ts` - GraphQL resolver
- `src/resolvers/Post.ts` - Post resolver

### Avatar System

- `src/electron/frontend/animations/` - VRMA animation files
- Three.js + three-vrm for 3D rendering

---

## 🚀 LAUNCH PREP (S3 Migration Note)

When almost ready to launch, move all uploaded files to S3:

- Profile pics: `/uploads/profiles/*`
- Avatar VRM files: `/uploads/avatars/*`
- Animation files: Can stay local or move to S3/CDN

Update upload endpoints to return S3 URLs instead of relative paths.
```

---

# FRIEND SYSTEM STATUS (4/6/26)

## Bug Found & Fixed

### Issue: Friend requests not appearing for recipient

**Problem**: User BMuniz11 sent friend request to jdoe, but when logged in as jdoe, no request appeared.

**Root Cause**: `FriendsDao` query builder was using **snake_case** column names (`requester_id`, `recipient_id`) instead of **camelCase** entity property names (`requesterId`, `recipientId`).

**Fixed in**: `src/dao/friends.dao.ts`

**Changed queries from**:

```typescript
.where('friend.requester_id = :userId ...')
.orderBy('friend.created_at', 'DESC')
```

**To**:

```typescript
.where('friend.requesterId = :userId ...')
.orderBy('friend.createdAt', 'DESC')
```

## Friend System - What Exists

### Backend (COMPLETE)

- [x] `src/entities/Friend.ts` - Friend entity
- [x] `src/dao/friends.dao.ts` - Data access layer (FIXED)
- [x] `src/models/friends.model.ts` - Business logic
- [x] `src/resolvers/Friend.ts` - GraphQL resolvers
- [x] `src/graphql/enums/FriendStatus.ts` - Enum (PENDING, ACCEPTED, BLOCKED)
- [x] `src/migrations/1765000000000-CreateFriendTable.ts` - Migration

### GraphQL API (COMPLETE)

- [x] `getFriends(userId)` - Get accepted friends list
- [x] `getPendingRequests(userId)` - Get pending friend requests (as recipient)
- [x] `searchUsers(query, userId)` - Search users by username
- [x] `isFriend(userId, otherUserId)` - Check friendship status
- [x] `sendFriendRequest(requesterId, data)` - Send friend request
- [x] `acceptFriendRequest(friendId, userId)` - Accept request
- [x] `declineFriendRequest(friendId, userId)` - Decline request
- [x] `unfriend(userId, friendId)` - Remove friend
- [x] `blockUser(requesterId, recipientId)` - Block user

### Frontend (MOSTLY COMPLETE)

- [x] Friends section UI in `index.html`
- [x] Friends list display
- [x] Pending requests display with Accept/Decline buttons
- [x] Search friends modal
- [x] Friend profile modal with avatar
- [x] Send friend request functionality
- [x] Accept/Decline friend request
- [x] Unfriend functionality
- [x] View friend profile

## Friend System - What Needs to be Built

### Phase 1: Basic Messaging (HIGH PRIORITY)

- [ ] `src/entities/Message.ts` - Message entity
- [ ] `src/dao/messages.dao.ts` - Message data access
- [ ] `src/models/messages.model.ts` - Message business logic
- [ ] `src/resolvers/Message.ts` - Message GraphQL resolvers
- [ ] `src/migrations/` - Message table migration
- [ ] Frontend messaging UI (message list, compose)
- [ ] Real-time message delivery (GraphQL subscriptions)

### Phase 2: Friend Activity (MEDIUM PRIORITY)

- [ ] Friend activity feed (see what friends are posting)
- [ ] lastActive tracking on User entity
- [ ] Online/offline status indicator

### Phase 3: Polish (LOWER PRIORITY)

- [ ] Notification when receiving friend request
- [ ] Notification cutscene (avatar delivery)
- [ ] Block confirmation dialog

## Database Schema (Existing)

```sql
-- Friends table
CREATE TABLE friend (
  id UUID PRIMARY KEY,
  requester_id UUID REFERENCES user(id),
  recipient_id UUID REFERENCES user(id),
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ACCEPTED, BLOCKED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Database Schema (NEEDED)

```sql
-- Messages table (for Phase 1)
CREATE TABLE message (
  id UUID PRIMARY KEY,
  sender_id UUID REFERENCES user(id),
  recipient_id UUID REFERENCES user(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_message_sender ON message(sender_id);
CREATE INDEX idx_message_recipient ON message(recipient_id);
CREATE INDEX idx_message_conversation ON message(sender_id, recipient_id);
```

## Files to Create for Messaging

| File                                       | Purpose                                             |
| ------------------------------------------ | --------------------------------------------------- |
| `src/entities/Message.ts`                  | Message entity with sender/recipient relations      |
| `src/dao/messages.dao.ts`                  | CRUD operations, conversation queries               |
| `src/models/messages.model.ts`             | Send, receive, mark read logic                      |
| `src/resolvers/Message.ts`                 | GraphQL: sendMessage, getConversations, getMessages |
| `src/migrations/xxx-CreateMessageTable.ts` | Database migration                                  |

## GraphQL API (NEEDED)

```graphql
# Queries
getConversations(userId): [Conversation!]!
getMessages(userId, friendId, limit, offset): [Message!]!

# Mutations
sendMessage(senderId, recipientId, content): Message!
markAsRead(messageId, userId): Boolean!

# Subscriptions (for real-time)
messageReceived(userId): Message!

---

## Friend System - Current Status (4/7/26)

### Completed Features

✅ **Friend Requests**
- Send friend request
- Accept friend request
- Decline friend request
- Cancel friend request
- View pending requests

✅ **Profile Display**
- User profile with avatar
- Friend profile modal with avatar
- Stats display (threads, posts, replies)

✅ **Your Threads Section**
- Shows threads authored by user
- Displays video thumbnails from first post
- Sorts by newest first
- Removes duplicates

✅ **Recent Activity Section**
- Shows user's replies to threads
- For root-level replies: shows thread title + first post thumbnail
- For nested replies: shows parent post being responded to
- Sorts by newest first

✅ **Backend Fixes**
- Fixed `getUserFromRequest.ts` - graphql-yoga uses Headers object, not plain object
- Added `posts` relation to `findAllByUserId` DAO
- Added `post.author` relation to `findThreadsUserParticipatedIn` DAO
- Posts DAO `findByAuthorId` now fetches parent post info

### Known Issues (To Refine Later)

1. **Older threads without posts** - Some older threads have empty `posts` arrays (posts weren't saved properly during creation)
2. **Posts not ordered** - Posts array doesn't have ORDER BY, so `posts[0]` isn't always the first post created
3. **Thread count discrepancy** - Stats may not match actual thread counts due to duplicate handling
4. **Friend's Recent Activity** - Still needs verification of thumbnails showing

### Files Modified

**Backend:**
- `src/auth/getUserFromRequest.ts` - Fixed Headers object handling
- `src/dao/threads.dao.ts` - Added posts relations
- `src/dao/posts.dao.ts` - Added parent post info to query

**Frontend:**
- `src/electron/frontend/app.js`
  - `loadUserThreads()` - Shows authored threads with thumbnails
  - `loadUserActivity()` - Shows recent activity with proper context
  - `loadFriendActivity()` - Same pattern for friend profiles
  - `loadProfileStats()` - Fixed thread/reply counting
- `src/electron/frontend/styles.css` - Added activity styling classes

### Next Session Priorities

1. **Direct Messages** - Build messaging system (Phase 1 from notes)
2. **Refine Profile Display** - Fix remaining issues with threads/activity
3. **Verify Friend Activity** - Ensure friend's recent activity shows properly

---

## Current Development (April 2026)

### What's Working

- **AI Browser**: Voice commands navigate 30+ websites instantly
- **VRM Avatar**: 25+ animations, customizable
- **5 AI Adapters**: OpenAI, Claude, Gemini, Perplexity, Ollama (local)
- **Thread System**: Perspective threads (Pro/Against/Neutral)
- **Servers**: Create servers with custom icons
- **Channels**: Text and announcement channels

### Current Focus

- **Messaging**: Fix message sending in servers
- **Channel listing**: Ensure channels display properly

---

## Vision Update (April 2026)

> **"The Rev starts with you!"**

TheRev is built to revolutionize how people interact with social media:

1. **Community First** - Build real connections, not algorithmic feeds
2. **Authentic Voices** - Real journalists over mainstream parrots
3. **Financial Globalization** - Question the narrative, question OCGFC
4. **Personal AI Assistant** - Your avatar helps navigate the information landscape

*We're building platform where truth matters more than funding.*

---

## Marketplace & Monetization Strategy

### The Vision
TheRev as a "super app" - social platform + marketplace + services all connected through AI.

**Not just a social app you use for free.**
**A platform where value flows both ways.**

### Why This Matters
- Gives users a reason to come back (transactions)
- Creates natural monetization (service fees)
- Differentiates from pure social platforms
- Makes the AI assistant more useful (help with purchases)

### Launch Strategy

#### Phase 1: Core Platform Launch
- ✅ Polished social/AI experience
- ✅ Forum + servers + channels + messaging
- ✅ Voice control + AI browser + avatar
- ✅ Hidden: Marketplace infrastructure

#### Phase 2: Enable Marketplace
- Turn on marketplace UI (feature flag)
- Early access for power users
- Test with services (laundry, food, goods)
- Gather feedback on pricing/model

#### Phase 3: Scale
- Add more categories
- Implement payment flow
- Service provider onboarding

---

### Marketplace MVP Features

#### Products & Services
```
Products:
- Physical goods (buy/sell)
- Categories: Electronics, Clothing, Home, etc.
- Listing: title, description, price, images
- Cart + checkout flow

Services:
- Laundry pickup/delivery
- Food ordering
- Task services (groceries, etc.)
- Provider profiles + ratings
```

#### Feature Flags
```env
# In .env
MARKETPLACE_ENABLED=false  # Hidden by default
MARKETPLACE_ADMIN_VIEW=true  # Only admins see it
```

#### UI Placement
- New "Marketplace" tab in sidebar
- Hidden unless MARKETPLACE_ENABLED=true
- Profile badge showing "Seller" status

---

### Revenue Model (Initial)
- **Service Fee**: 5-10% on transactions
- **Premium Listings**: Sellers pay for promotion
- **AI Agent Fee**: Optional assistant for purchase help

### Payment Processing: Stripe

#### Why Stripe
- Developer-friendly APIs
- Handles PCI compliance
- Supports marketplace (Connect)
- Webhooks for order completion

#### Integration Plan
```
Stripe Products:
- Stripe Connect (marketplace sellers)
- Stripe Checkout (cart → payment)
- Stripe Webhooks → Update order status

Flow:
1. User adds to cart
2. Checkout → Stripe Checkout session
3. Payment success → Webhook triggers order creation
4. Seller sees order, fulfills it
5. Platform takes fee, sends rest to seller
```

#### Stripe Connect (Marketplace Model)
```
- Express accounts for sellers
- Platform collects fee (application_fee_amount)
- Automatic split: seller gets X%, platform gets Y%
```

#### Environment Variables
```env
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_FEE_PERCENT=10
```

#### Key Files to Create
```
src/payment/
├── StripeService.ts      # Payment processing
├── ConnectService.ts     # Seller onboarding
├── WebhookHandler.ts     # Stripe webhooks
└── types.ts              # Payment types
```

---

### Stories to Build Later (Epic: Marketplace)

#### Story 1: Marketplace UI Shell
- Add "Marketplace" tab to navigation
- Create placeholder page (hidden by default)
- Add feature flag check

#### Story 2: Product Listings
- Product entity (name, description, price, images, seller)
- Create listing form
- Product grid view

#### Story 3: Service Listings  
- Service entity (name, description, price, provider, location)
- Category: Laundry, Food, Tasks, Goods
- Provider profile page

#### Story 4: Cart & Checkout
- Shopping cart functionality
- Order summary
- Place order flow

#### Story 5: Seller Dashboard
- My listings management
- Orders received
- Earnings view

---

## UI Redesign: Tab Navigation

### Current Tabs (from index.html line 344-356)
```
<nav class="nav">
  [Messages] [Threads] [News] [Friends] [AI Settings] [Tasks]
  [Analytics] [Audit Log] [Shards] [Profile] [Browser] [Avatar]
</nav>
```

### Proposed Structure

**Keep these as top-level** (they stay as is):
- 🔥 News - stays separate
- 🌐 Browser - stays separate  
- 🎭 Avatar - stays separate (but move to settings later)

**Group under "Social" container**:
- 💬 Messages
- 📋 Threads
- 👥 Friends
- 👤 Profile
- 🖥️ Tasks (optional - maybe leave as is)
- 📊 Analytics (maybe leave as is)

**Group under "Settings"**:
- 🤖 AI Settings
- 🎭 Avatar Settings (move from top level)
- 🔒 Audit Log (admin, maybe keep or move)
- 🗄️ Shards (admin, maybe keep or move)

---

### New Layout
```
[Logo]  [Social] [News] [Browser]  [Settings ⚙️]
```

Or possibly:
```
[Logo]  [Social] [News] [Browser] [Avatar] [Settings ⚙️]
```

Where Social opens to: Messages | Threads | Friends | Profile

Where Settings opens to: AI Settings | Voice Settings | Account

---

### Affected Files
```
src/electron/frontend/
├── index.html        # Change nav structure (lines 344-356)
├── styles.css        # Update nav styling (lines 124-168)
└── app.js            # Update routing/navigation logic (lines 1381-1449)
```

---

### Implementation Plan

#### Step 1: Update HTML (index.html lines 344-356)
Change from:
```html
<nav class="nav">
  <button id="messages-btn" class="nav-btn">Messages</button>
  <button id="threads-btn" class="nav-btn active">Threads</button>
  <button id="news-btn" class="nav-btn">News</button>
  <button id="friends-btn" class="nav-btn">Friends</button>
  <button id="ai-settings-btn" class="nav-btn">AI Settings</button>
  <button id="tasks-btn" class="nav-btn">Tasks</button>
  <button id="analytics-btn" class="nav-btn">Analytics</button>
  <button id="audit-btn" class="nav-btn">Audit Log</button>
  <button id="shards-btn" class="nav-btn">Shards</button>
  <button id="profile-btn" class="nav-btn">Profile</button>
  <button id="browser-btn" class="nav-btn">Browser</button>
  <button id="avatar-btn" class="nav-btn">Avatar</button>
</nav>
```

To:
```html
<nav class="nav">
  <button id="social-btn" class="nav-btn">Social</button>
  <button id="threads-btn" class="nav-btn">Threads</button>
  <button id="news-btn" class="nav-btn">News</button>
  <button id="friends-btn" class="nav-btn">Friends</button>
  <button id="messages-btn" class="nav-btn">Messages</button>
  <button id="profile-btn" class="nav-btn">Profile</button>
  <button id="browser-btn" class="nav-btn">Browser</button>
  <button id="avatar-btn" class="nav-btn">Avatar</button>
  <button id="ai-settings-btn" class="nav-btn">AI</button>
  <!-- Hidden/admin: tasks, analytics, audit, shards -->
</nav>
```

Then add Social dropdown container after nav

#### Step 2: Update CSS (styles.css)
- Add `.nav-dropdown` styles
- Add `.nav-group` styles for grouping
- Update `.nav` to handle grouped buttons

#### Step 3: Update JS (app.js)
- Add event listener for `#social-btn`
- Add click handling for dropdown items
- Keep existing button handlers but update routing

---

### Sub-navigation for Social

When "Social" is clicked → show dropdown with:
- 🏠 Home (Threads)
- 💬 Messages  
- 👥 Friends
- 👤 Profile

---

### Hidden/Admin Tabs (keep working, hide from nav)
- Tasks
- Analytics
- Audit Log
- Shards

These can be accessed via settings or remain hidden unless admin

---

### Implementation Tasks
1. [ ] Update index.html nav structure
2. [ ] Add Social dropdown container HTML
3. [ ] Add CSS for dropdown/modal styling
4. [ ] Update app.js for social button click
5. [ ] Reorder tabs to be cleaner
6. [ ] Test all navigation still works
```
