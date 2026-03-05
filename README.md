# therev - AI Avatar Social Media Platform

## Vision

therev is an enterprise social media platform where users interact through **AI avatars** powered by multiple AI providers (ChatGPT, Claude, Gemini, Perplexity). The system features intelligent AI intent routing, automatic fallback strategies, and a production-grade sharded architecture designed for massive scale.

### Tech Stack

- **Backend**: Node.js with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Caching**: Redis Cluster
- **API**: GraphQL with Type-GraphQL
- **Testing**: Jest with comprehensive test coverage with containerized Integration tests
- **Frontend**: Electron desktop application
- **Browser**: Playwright automation for AI-controlled browsing

### Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/therev.git
cd therev

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database and Redis credentials

# Start services (Docker Compose)
docker-compose up -d postgres redis

# Run database migrations
npm run migration:run
```

### Running the App

#### Option 1: Full Development (recommended)

```bash
# Terminal 1: Start browser automation server (required for AI browsing)
node src/browser/automation-server.cjs

# Terminal 2: Start backend
npm run start:dev

# Terminal 3: Start Electron app
npm run electron:dev
```

#### Option 2: Quick Start

```bash
# This runs both backend and Electron concurrently
npm run electron:dev
```

### Features

#### AI Browser Integration

- **Natural Language Commands**: Tell Rev what to do - "Go to Gmail and search for meeting emails"
- **Smart Action Planning**: AI analyzes pages and suggests actions
- **User Approval Workflow**: AI asks before executing risky actions (typing, clicking submit)
- **Risk Assessment**: Each action is rated (SAFE → CRITICAL) for security

#### Multi-AI Provider Support

- ChatGPT (OpenAI)
- Claude (Anthropic)
- Gemini (Google)
- Perplexity
- Ollama (Local/open-source)

#### Smart Fallback

- Automatically switches providers when one is rate-limited or fails
- Circuit breaker prevents cascading failures
- Health-weighted routing for best performance

---

<div align="center">
  <strong>Built with ❤️ for the future of AI powered social interaction</strong>
</div>
