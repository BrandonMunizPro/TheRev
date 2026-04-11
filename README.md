# TheRev - AI Avatar Social Media Platform

## Vision

TheRev is a revolutionary social media platform designed to **revolutionize how people interact** - built for community, learning, and authentic expression. Unlike corporate social media that pushes mainstream narratives, TheRev empowers real journalists and independent thinkers who question the status quo.

Through **customizable AI avatars**, users express themselves uniquely while an **AI personal assistant** helps navigate the information landscape. The platform connects people with authentic voices who challenge financial globalization rather than parrot the opinions of those who control it.

### Our Mission

> _"The Rev starts with you!"_

We're building a platform where:

- **Community comes first** - Connect with genuine people, not algorithms
- **Learning is continuous** - Share knowledge and grow together
- **Voice is authentic** - Express yourself through a customizable avatar
- **Truth matters** - Real journalists over mainstream parrots

### Tech Stack

- **Backend**: Node.js with TypeScript
- **Database**: PostgreSQL (TypeORM)
- **Caching**: Redis
- **API**: GraphQL with Type-GraphQL
- **Frontend**: Electron desktop application
- **AI**: Multiple providers (Ollama local, OpenAI, Claude, Gemini, Perplexity)
- **Avatar**: VRM 3D avatars with animations

### Prerequisites

```bash
# Install Node.js (v18+)
# Install Docker Desktop
# Install Ollama (optional, for local AI)
```

### Quick Start

#### 1. Clone and Install

```bash
git clone https://github.com/your-org/therev.git
cd therev
npm install
```

#### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

#### 3. Start Database (Docker)

```bash
# Start PostgreSQL in Docker
docker run -d --name therev-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=therev \
  -p 5432:5432 \
  postgres:15

# Run migrations to your Docker database
npm run migration:run
```

#### 4. Run the Full App

```bash
# This runs everything: backend + Electron
npm run electron:full:dev
```

> **Note**: If you want to run services separately:
>
> ```bash
> # Terminal 1: Backend
> npm run start:dev
>
> # Terminal 2: Electron
> npm run electron:dev
> ```

### Features

#### 🗣️ Voice-Controlled AI Browser

- **Natural Language Commands**: Tell Rev what to do - "Go to Youtube and find latest news"
- **Smart Action Planning**: AI analyzes pages and suggests actions
- **User Approval Workflow**: AI asks before executing actions
- **30+ Website Support**: Instant navigation to major news sites

#### 🤖 Multi-AI Provider Support

- **Ollama** (local/open-source) - Default, runs on your machine
- **ChatGPT** (OpenAI)
- **Claude** (Anthropic)
- **Gemini** (Google)
- **Perplexity**

_Smart fallback automatically switches providers when one is rate-limited_

#### 🎬 VRM Avatar System

- **45+ Animations**: Idle, Dance, Walk, Fight, Sports, Music, and more
- **Customizable**: Upload your own VRM model from VRoid Studio
- **Expression**: Avatar reacts to content sentiment
- **Profile Integration**: Your avatar appears on your profile

#### 📰 Perspective Threads

- **Three Perspectives**: Pro / Against / Neutral
- **Threaded Discussions**: Nested replies
- **Media Support**: YouTube videos, links, images
- **Community Moderation**: Vote-Based system

#### 💬 Servers & Channels (Discord-like)

- **Create Servers**: Build your community
- **Text Channels**: General, announcements, topics
- **Voice Channels**: Coming soon
- **Server Icons**: Upload custom icons

#### 👥 Friends & Social

- **Friend Requests**: Send/accept/decline
- **Activity Feed**: See what friends are posting
- **Profile Pages**: Custom avatars and bios

#### 📊 Analytics Dashboard

- **Thread Analytics**: Engagement metrics
- **User Activity**: Participation stats
- **Shard Health**: Database monitoring

### Project Structure

```
therev/
├── src/
│   ├── electron/           # Electron app
│   │   └── frontend/     # UI (HTML/CSS/JS)
│   ├── entities/          # Database entities
│   ├── resolvers/        # GraphQL resolvers
│   ├── models/          # Data models
│   ├── ai/              # AI routing & intents
│   ├── browser/          # Playwright automation
│   └── data-source.ts   # Database config
├── uploads/             # User uploads
├── animations/          # VRM animations
├── package.json
└── README.md
```

### Commands

| Command                      | Description          |
| ---------------------------- | -------------------- |
| `npm run start:dev`          | Start backend only   |
| `npm run electron:dev`       | Start Electron only  |
| `npm run electron:full:dev`  | Start full app       |
| `npm run migration:generate` | Create new migration |
| `npm run migration:run`      | Run migrations       |
| `npm run typecheck`          | TypeScript check     |

---

<div align="center">

### Built with ❤️ for authentic voices

**The Rev starts with you!**

_Questioning the narrative, empowering the community._

</div>
