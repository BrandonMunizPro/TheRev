# therev - AI Avatar Social Media Platform
## Vision

therev is an enterprise social media platform where users interact through **AI avatars** powered by multiple AI providers (ChatGPT, Claude, Gemini, Perplexity). The system features intelligent AI intent routing, automatic fallback strategies, and a production-grade sharded architecture designed for massive scale.

### Tech Stack
- **Backend**: Node.js with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Caching**: Redis Cluster
- **API**: GraphQL with Type-GraphQL
- **Testing**: Jest with comprehensive test coverage with containerize Integrartion tests
- **Frontend**: Electron desktop application



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

# Start development server
npm run start:dev

# Start Electron app (separate terminal)
npm run electron:dev
```

<div align="center">
  <strong>Built with ❤️ for the future of AI powered social interaction</strong>
</div>
