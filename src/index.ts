import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import path from 'path';
import { getUserFromRequest } from './auth/getUserFromRequest';
import { createYoga } from 'graphql-yoga';
import { AppDataSource } from './data-source';
import { buildSchema } from 'type-graphql';
import { UserResolver } from './resolvers/User';
import { ThreadResolver } from './resolvers/Thread';
import { AuthResolver } from './resolvers/Auth';
import { PostResolver } from './resolvers/Post';
import { ThreadAdminResolver } from './resolvers/ThreadPermissions';
import { GraphQLContext } from './graphql/context';
import { AIIntentClassifier } from './ai/AIIntentClassifier';
import {
  AIIntentType,
  IntentClassification,
  AIProvider,
} from './ai/AIIntentTypes';
import {
  adapterFactory,
  ChatGPTAdapter,
  ClaudeAdapter,
  GeminiAdapter,
  PerplexityAdapter,
  OllamaAdapter,
} from './ai/adapters';
import { SmartFallbackService } from './ai/SmartFallbackService';
import { browserAgent } from './ai/BrowserAgent';
import { NewsIngestionService } from './services/news/NewsIngestionService';
import { NewsArticle } from './entities/NewsArticle';

const app = express();
const PORT = 4000;

const intentClassifier = new AIIntentClassifier();
const fallbackService = new SmartFallbackService();

// Track configured providers
const configuredProviders: Map<
  AIProvider,
  { apiKey?: string; baseUrl?: string; model?: string }
> = new Map();

async function initializeAIProviders() {
  // Initialize with environment variables if available
  const configs = [
    {
      provider: AIProvider.CHATGPT,
      adapter: new ChatGPTAdapter(),
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    {
      provider: AIProvider.CLAUDE,
      adapter: new ClaudeAdapter(),
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    },
    {
      provider: AIProvider.GEMINI,
      adapter: new GeminiAdapter(),
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    {
      provider: AIProvider.PERPLEXITY,
      adapter: new PerplexityAdapter(),
      apiKey: process.env.PERPLEXITY_API_KEY,
      model:
        process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-large-128k-online',
    },
  ];

  // Register paid providers if API keys exist
  for (const { provider, adapter, apiKey, model } of configs) {
    if (apiKey) {
      try {
        await adapterFactory.registerAdapter(provider, adapter, {
          apiKey,
          model,
        });
        configuredProviders.set(provider, { apiKey, model });
        console.log(`✅ ${provider} adapter initialized`);
      } catch (err) {
        console.error(`❌ Failed to initialize ${provider}:`, err);
      }
    }
  }

  // Always initialize Ollama as fallback
  try {
    const ollama = new OllamaAdapter();
    const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

    // First check what models are available
    const tagsResponse = await fetch(`${baseUrl}/api/tags`);
    const tagsData = (await tagsResponse.json()) as {
      models?: Array<{ name: string }>;
    };
    const availableModels = tagsData.models?.map((m) => m.name) || [];

    if (availableModels.length === 0) {
      console.log(
        '⚠️ Ollama has no models. Run "ollama pull llama3" to download a model.'
      );
      return;
    }

    // Use the first available model or the configured one
    const configuredModel = process.env.OLLAMA_MODEL || 'llama3';
    const model =
      availableModels.find((m) => m.startsWith(configuredModel)) ||
      availableModels[0];

    await ollama.initialize({ baseUrl, model });
    if (await ollama.isHealthy()) {
      await adapterFactory.registerAdapter(AIProvider.OPEN_SOURCE, ollama);
      configuredProviders.set(AIProvider.OPEN_SOURCE, { baseUrl, model });
      console.log(`✅ Ollama adapter initialized (model: ${model})`);
    }
  } catch (err) {
    console.log(
      '⚠️ Ollama not available:',
      err instanceof Error ? err.message : 'Unknown error'
    );
  }

  // Start health monitoring
  adapterFactory.startHealthMonitoring(30000);

  // Initialize browser agent with Ollama
  await browserAgent.initialize(AIProvider.OPEN_SOURCE);
  console.log('✅ Browser Agent initialized');
}

async function startServer() {
  console.log('[DB] Attempting to connect to:', process.env.DB_DATABASE);
  try {
    await AppDataSource.initialize();
    if (process.env.NODE_ENV !== 'production') {
      console.log('📡 NEXUS database connected');
    }
  } catch (dbError) {
    console.log('[DB] Connection error:', dbError);
    console.log('📡 Database not connected (running without DB)');
  }

  // Initialize AI providers
  try {
    await initializeAIProviders();
  } catch (aiError) {
    console.log('📡 AI providers not initialized:', aiError);
  }

  try {
    const schema = await buildSchema({
      resolvers: [
        AuthResolver,
        UserResolver,
        ThreadResolver,
        ThreadAdminResolver,
        PostResolver,
      ],
      validate: false,
    });

    const yoga = createYoga<GraphQLContext>({
      schema,
      graphqlEndpoint: '/graphql',
      context: ({ request }) => ({
        user: getUserFromRequest(request),
      }),
    });

    app.use(express.json());

    // Serve static files for password reset
    app.get('/reset-password.html', (req, res) => {
      res.sendFile(
        path.join(__dirname, 'electron/frontend/reset-password.html')
      );
    });

    app.use('/graphql', yoga as any);

    // Import services for REST endpoints
    const { TaskAnalyticsService } =
      await import('./services/TaskAnalyticsService');
    const { EnterpriseAuditService, TypeORMEnterpriseAuditRepository } =
      await import('./audit');
    const { ShardHealthMonitor } =
      await import('./database/sharding/ShardHealthMonitor');

    // Services will use existing DB connection if available
    const analyticsService = AppDataSource.isInitialized
      ? new TaskAnalyticsService(AppDataSource.manager)
      : null;
    const auditRepository = AppDataSource.isInitialized
      ? new TypeORMEnterpriseAuditRepository(AppDataSource.manager)
      : null;
    const auditService = auditRepository
      ? new EnterpriseAuditService(auditRepository)
      : null;
    const shardHealthMonitor = new ShardHealthMonitor();

    // Analytics Endpoint
    app.get('/api/analytics', async (req, res) => {
      try {
        if (!analyticsService) {
          return res.json({
            totalTokens: 0,
            totalTasks: 0,
            totalCost: 0,
            avgResponseTime: 0,
            byProvider: {},
            workers: [],
            queues: [],
            period: '24h',
            message: 'Database not connected',
          });
        }

        const period = (req.query.period as string) || '24h';
        const systemHealth = await analyticsService.getSystemHealth();
        const workers = await analyticsService.getAllWorkerMetrics();

        const totals = {
          totalTokens: systemHealth.totalTasksCompleted * 500,
          totalTasks: systemHealth.totalTasksCompleted,
          totalCost: systemHealth.totalTasksCompleted * 0.01,
          avgResponseTime: Math.round(systemHealth.averageProcessingTime),
        };

        const byProvider: Record<string, number> = {};
        workers.forEach((w) => {
          byProvider['Ollama'] = (byProvider['Ollama'] || 0) + w.tasksProcessed;
        });

        res.json({
          ...totals,
          byProvider,
          workers,
          queues: systemHealth.queues,
          period,
        });
      } catch (error) {
        console.error('[Analytics] Error:', error);
        res.json({
          totalTokens: 0,
          totalTasks: 0,
          totalCost: 0,
          avgResponseTime: 0,
          byProvider: {},
          workers: [],
          queues: [],
          period: '24h',
        });
      }
    });

    // Audit Log Endpoint
    app.get('/api/audit-log', async (req, res) => {
      try {
        if (!auditService) {
          return res.json([]);
        }

        const filter = {
          category: (req.query.category as string) || undefined,
          startDate: req.query.startDate
            ? new Date(req.query.startDate as string)
            : undefined,
          endDate: req.query.endDate
            ? new Date(req.query.endDate as string)
            : undefined,
          userId: (req.query.userId as string) || undefined,
          severity: (req.query.severity as string) || undefined,
        };

        const logs = await auditService.query({ ...filter, limit: 100 });
        res.json(logs);
      } catch (error) {
        console.error('[Audit] Error:', error);
        res.json([]);
      }
    });

    // Shard Health Endpoint
    app.get('/api/shard-health', async (req, res) => {
      try {
        const health = await shardHealthMonitor.getHealthMetrics();
        res.json(health);
      } catch (error) {
        console.error('[Shard Health] Error:', error);
        // Return empty array on error
        res.json([]);
      }
    });

    // News Endpoints
    const newsIngestionService = new NewsIngestionService();

    // Get news articles
    app.get('/api/news', async (req, res) => {
      try {
        const source = req.query.source as string;
        const type = req.query.type as 'article' | 'video';
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const news = await newsIngestionService.getNews({
          source,
          type: type as any,
          limit,
          offset,
        });
        res.json(news);
      } catch (error) {
        console.error('[News] Error fetching news:', error);
        res.json([]);
      }
    });

    // Get available news sources
    app.get('/api/news/sources', async (req, res) => {
      try {
        const sources = await newsIngestionService.getSources();
        res.json(sources);
      } catch (error) {
        console.error('[News] Error fetching sources:', error);
        res.json([]);
      }
    });

    // Sync news feeds (trigger RSS fetch)
    app.post('/api/news/sync', async (req, res) => {
      try {
        const totalNew = await newsIngestionService.syncAllFeeds();
        res.json({ success: true, newArticles: totalNew });
      } catch (error) {
        console.error('[News] Error syncing feeds:', error);
        res.json({ success: false, error: 'Sync failed' });
      }
    });

    // Summarize news article endpoint
    app.post('/api/news/summarize', async (req, res) => {
      try {
        const { articleId, url, title } = req.body;

        if (!articleId && !url) {
          return res.json({
            success: false,
            error: 'articleId or url required',
          });
        }

        let articleTitle = title || '';
        let articleSummary = '';
        let articleContent = '';

        // Try to get article from database if we have an ID
        if (articleId) {
          const article = await newsIngestionService.getArticleById(articleId);
          if (article) {
            articleTitle = article.title;
            articleSummary = article.summary || '';
            articleContent = article.content || '';
          }
        }

        // Build content to summarize
        const contentToSummarize =
          articleTitle + '\n\n' + (articleSummary || articleContent);

        if (!contentToSummarize.trim()) {
          return res.json({
            success: false,
            error: 'No content available to summarize',
          });
        }

        // Get best available AI provider
        const provider = adapterFactory.getBestAvailableProvider();

        if (!provider) {
          return res.json({
            success: false,
            error: 'No AI provider available',
            summary:
              articleSummary || 'Please browse to the article to read it.',
          });
        }

        const adapter = adapterFactory.getAdapter(provider);

        if (!adapter) {
          return res.json({
            success: false,
            error: 'AI adapter not available',
            summary:
              articleSummary || 'Please browse to the article to read it.',
          });
        }

        // Use AI to summarize
        const summaryPrompt = `Please provide a brief summary of the following article (2-3 sentences max). Focus on the main points and key takeaways:\n\n${contentToSummarize.substring(0, 4000)}`;

        const aiResponse = await adapter.complete({
          provider,
          prompt: summaryPrompt,
          maxTokens: 300,
        });

        const aiSummary = aiResponse.content;

        // Update article in database with AI summary if we have an ID
        if (articleId) {
          const article = await newsIngestionService.getArticleById(articleId);
          if (article) {
            article.aiSummary = aiSummary;
            await AppDataSource.getRepository(NewsArticle).save(article);
          }
        }

        console.log(
          '[News] AI Summary generated:',
          aiSummary.substring(0, 100) + '...'
        );

        res.json({
          success: true,
          summary: aiSummary,
          title: articleTitle,
          provider: provider,
        });
      } catch (error) {
        console.error('[News] Error summarizing article:', error);
        res.json({ success: false, error: error.message });
      }
    });

    // Summarize any text endpoint
    app.post('/api/summarize-text', async (req, res) => {
      try {
        const { text, url, title } = req.body;

        if (!text || text.length < 50) {
          return res.json({
            success: false,
            error: 'Text too short to summarize',
          });
        }

        // Get best available AI provider
        const provider = adapterFactory.getBestAvailableProvider();

        if (!provider) {
          return res.json({
            success: false,
            error: 'No AI provider available',
          });
        }

        const adapter = adapterFactory.getAdapter(provider);

        if (!adapter) {
          return res.json({
            success: false,
            error: 'AI adapter not available',
          });
        }

        // Use AI to summarize the text
        const summaryPrompt = `You are summarizing a webpage. Provide a concise summary (2-3 sentences) of the main points:\n\n${text.substring(0, 8000)}`;

        const aiResponse = await adapter.complete({
          provider,
          prompt: summaryPrompt,
          maxTokens: 300,
        });

        const summary = aiResponse.content;

        console.log(
          '[Summarize] Generated summary:',
          summary.substring(0, 100) + '...'
        );

        res.json({
          success: true,
          summary,
          provider: provider,
        });
      } catch (error) {
        console.error('[Summarize] Error:', error);
        res.json({ success: false, error: error.message });
      }
    });

    // AI Browser Command Endpoint
    app.post('/api/ai-browser-command', async (req, res) => {
      try {
        const { command, preferredProvider } = req.body;

        if (!command) {
          return res.json({ success: false, error: 'No command provided' });
        }

        console.log('[Ask Rev] Processing command:', command);

        // Classify the command intent
        const intentResult = intentClassifier.classify(command);
        console.log(
          '[Ask Rev] Intent:',
          intentResult.intent,
          'confidence:',
          intentResult.confidence
        );

        // For simple navigation commands (google x, youtube x, tell me about x), return URL immediately
        const lower = command.toLowerCase();
        const isSimpleNavigation =
          intentResult.intent === AIIntentType.NAVIGATE_URL ||
          intentResult.intent === AIIntentType.UNKNOWN ||
          lower.includes('google') ||
          lower.includes('youtube') ||
          lower.includes('search') ||
          lower.startsWith('tell me about') ||
          lower.startsWith('what is') ||
          lower.startsWith('who is') ||
          lower.startsWith('look up');

        if (isSimpleNavigation) {
          // FAST PATH - just extract URL and return immediately
          const url = extractNavigationUrl(command, intentResult);
          console.log('[Ask Rev] Fast navigation to:', url);

          // Generate context async (don't wait)
          const contextPromise = browserAgent
            .generateContextInfo(command, [])
            .catch(() => null);

          // Start generating context in background but return immediately
          contextPromise.then((context) => {
            console.log('[Ask Rev] Context ready:', context?.substring(0, 50));
          });

          return res.json({
            success: true,
            url,
            command,
            intent: intentResult.intent,
            // Don't wait for context - it loads async on frontend
            context: null,
            fast: true,
          });
        } else {
          // For complex automation tasks, use Browser Agent
          console.log('[Ask Rev] Using Browser Agent for automation...');

          try {
            const agentResult = await browserAgent.executeTask(command);

            if (agentResult.success && agentResult.results) {
              return res.json({
                success: true,
                executed: true,
                actions: agentResult.actions.map((a) => a.description),
                steps: agentResult.results,
                intent: intentResult.intent,
                message: `Executed ${agentResult.actions.length} browser actions`,
                url: agentResult.results[0]?.result?.url || null,
                // Context will load async on frontend
                context: null,
              });
            } else {
              // Fallback to URL navigation - FAST
              const url = extractNavigationUrl(command, intentResult);

              return res.json({
                success: true,
                url,
                command,
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                fallback: true,
                // Context will load async on frontend
                context: null,
              });
            }
          } catch (agentError) {
            console.error('[Ask Rev] Browser agent error:', agentError);
            // Fallback to simple navigation - FAST
            const url = extractNavigationUrl(command, intentResult);

            return res.json({
              success: true,
              url,
              command,
              intent: intentResult.intent,
              confidence: intentResult.confidence,
              // Context will load async on frontend
              context: null,
            });
          }
        }

        // For AI-powered tasks (generation, analysis, etc.), use LLM
        const requestedProvider = preferredProvider
          ? AIProvider[preferredProvider as keyof typeof AIProvider]
          : intentResult.recommendedProvider;

        // Use SmartFallbackService to get best available provider
        let provider =
          fallbackService.getBestAvailableProvider(
            requestedProvider || AIProvider.CHATGPT,
            undefined,
            'health-weighted'
          ) || AIProvider.OPEN_SOURCE;

        console.log('[Ask Rev] Using provider:', provider);

        // Execute with the selected provider
        const adapter = adapterFactory.getAdapter(provider);
        if (!adapter) {
          // Fallback to search if no adapter available
          const query = encodeURIComponent(command);
          return res.json({
            success: true,
            url: `https://www.google.com/search?q=${query}`,
            intent: intentResult.intent,
            confidence: intentResult.confidence,
          });
        }

        const systemPrompt =
          intentResult.processingHints?.systemPrompt ||
          'You are Rev, a helpful AI assistant. Respond directly and concisely to the user request.';

        const aiResponse = await adapter.complete({
          provider,
          prompt: command,
          systemPrompt,
          maxTokens: intentResult.processingHints?.maxTokens || 1024,
          temperature: intentResult.processingHints?.temperature || 0.7,
        });

        console.log(
          '[Ask Rev] AI response:',
          aiResponse.content.substring(0, 100) + '...'
        );

        return res.json({
          success: true,
          response: aiResponse.content,
          provider: provider,
          model: aiResponse.model,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          isAIResponse: true,
          context: aiResponse.content, // Include response as context too
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[Ask Rev] Error:', errorMessage);

        // Try fallback to Ollama on error
        try {
          const ollamaAdapter = adapterFactory.getAdapter(
            AIProvider.OPEN_SOURCE
          );
          if (ollamaAdapter) {
            const aiResponse = await ollamaAdapter.complete({
              provider: AIProvider.OPEN_SOURCE,
              prompt: req.body.command,
              systemPrompt: 'You are Rev, a helpful AI assistant.',
              maxTokens: 1024,
            });

            return res.json({
              success: true,
              response: aiResponse.content,
              provider: 'ollama',
              model: aiResponse.model,
              isAIResponse: true,
              isFallback: true,
            });
          }
        } catch {}

        // Final fallback to search
        const query = encodeURIComponent(req.body.command);
        res.json({
          success: true,
          url: `https://www.google.com/search?q=${query}`,
          error: errorMessage,
        });
      }
    });

    // Context endpoint - returns context for a search query
    app.post('/api/ai-context', async (req, res) => {
      try {
        const { command } = req.body;
        if (!command) {
          return res.json({ success: false, error: 'No command provided' });
        }

        // Generate context using BrowserAgent
        const contextInfo = await browserAgent.generateContextInfo(command, []);

        res.json({
          success: true,
          context: contextInfo,
        });
      } catch (error) {
        res.json({ success: false, context: null });
      }
    });

    // Add ai-chat endpoint that the frontend uses
    app.post('/api/ai-chat', async (req, res) => {
      try {
        const { message, context, url } = req.body;

        if (!message) {
          return res.json({ success: false, error: 'No message provided' });
        }

        // Build the command - include page context if available
        let command = message;
        if (context) {
          command = `${message}\n\nContext: ${context}`;
        }

        // Call the main browser command endpoint
        const response = await fetch(
          'http://localhost:4000/api/ai-browser-command',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command }),
          }
        );

        const result = await response.json();

        // Format the response for the frontend chat
        if (result.executed) {
          // Browser actions were executed
          return res.json({
            success: true,
            actions:
              result.actions?.map((desc: string, i: number) => ({
                type: 'EXECUTE',
                description: desc,
                result: result.steps?.[i]?.result,
              })) || [],
            response: result.message || 'Executed browser actions',
            screenshot: result.screenshot,
            url: result.url,
            executed: true,
          });
        } else if (result.url) {
          // Navigation needed
          return res.json({
            success: true,
            actions: [
              {
                type: 'NAVIGATE',
                value: result.url,
                reason: result.command || message,
              },
            ],
            response: result.url
              ? `Navigating to ${result.url}`
              : result.response,
          });
        } else if (result.response) {
          // AI text response
          return res.json({
            success: true,
            response: result.response,
            provider: result.provider,
            model: result.model,
          });
        }

        return res.json(result);
      } catch (error) {
        res.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Get available AI providers status
    app.get('/api/ai-providers', async (req, res) => {
      const health = adapterFactory.getAllHealthStatus();
      const available = adapterFactory.getAvailableProviders();

      res.json({
        available,
        health: health.map((h) => ({
          provider: h.provider,
          isHealthy: h.isHealthy,
          latencyMs: h.latencyMs,
          circuitState: h.circuitState,
        })),
        configured: Array.from(configuredProviders.keys()),
      });
    });

    // Configure a new AI provider
    app.post('/api/ai-providers/configure', async (req, res) => {
      try {
        const { provider, apiKey, baseUrl, model } = req.body;

        if (!provider || !apiKey) {
          return res.json({
            success: false,
            error: 'Provider and API key required',
          });
        }

        let adapter: any;
        let config: any = { model };

        switch (provider) {
          case 'CHATGPT':
            adapter = new ChatGPTAdapter();
            config.apiKey = apiKey;
            break;
          case 'CLAUDE':
            adapter = new ClaudeAdapter();
            config.apiKey = apiKey;
            break;
          case 'GEMINI':
            adapter = new GeminiAdapter();
            config.apiKey = apiKey;
            break;
          case 'PERPLEXITY':
            adapter = new PerplexityAdapter();
            config.apiKey = apiKey;
            break;
          case 'OLLAMA':
            adapter = new OllamaAdapter();
            config.baseUrl = baseUrl || 'http://localhost:11434';
            config.model = model || 'llama3';
            break;
          default:
            return res.json({ success: false, error: 'Unknown provider' });
        }

        await adapterFactory.registerAdapter(
          AIProvider[provider as keyof typeof AIProvider],
          adapter,
          config
        );

        const aiProvider = AIProvider[provider as keyof typeof AIProvider];
        configuredProviders.set(aiProvider, { apiKey, baseUrl, model });

        res.json({ success: true, provider });
      } catch (error) {
        res.json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to configure provider',
        });
      }
    });

    // Check Ollama status
    app.get('/api/ollama/status', async (req, res) => {
      const health = adapterFactory.getHealthStatus(AIProvider.OPEN_SOURCE);
      if (health?.isHealthy) {
        const config = configuredProviders.get(AIProvider.OPEN_SOURCE);
        return res.json({
          ready: true,
          provider: 'ollama',
          model: config?.model || 'llama3',
          url: config?.baseUrl || 'http://localhost:11434',
        });
      }
      return res.json({ ready: false, error: 'Ollama not available' });
    });

    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🧠 NEXUS core listening on http://localhost:${PORT}`);
        console.log(`🚀 GraphQL ready at http://localhost:${PORT}/graphql`);
      }
    });
  } catch (error) {
    console.error('Server init error:', error);
    // Start basic server without GraphQL
    app.listen(PORT, () => {
      console.log(`🧠 NEXUS core listening on http://localhost:${PORT}`);
    });
  }
}

function extractNavigationUrl(command: string, intentResult: any): string {
  const lowerCommand = command.toLowerCase();

  // YouTube
  if (lowerCommand.includes('youtube') || lowerCommand.includes('yt ')) {
    let query = '';
    const searchMatch = command.match(
      /(?:search|find|watch|look up)[\s]+(.+?)(?:\s+on|\s+in|\s+at|\s+youtube|$)/i
    );
    const ytMatch = command.match(/(?:youtube|yt)[\s:,-]*(.+)/i);

    if (searchMatch?.[1]) query = searchMatch[1].trim();
    else if (ytMatch?.[1])
      query = ytMatch[1]
        .replace(/^(go to|search|find|to|and)[\s]*/gi, '')
        .trim();

    return query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : 'https://www.youtube.com';
  }

  // Gmail
  if (lowerCommand.includes('gmail') || lowerCommand.includes('email')) {
    return 'https://mail.google.com';
  }

  // Reddit
  if (lowerCommand.includes('reddit')) {
    const match = command.match(
      /(?:search|find|look up)[\s]+(.+?)(?:\s+on|\s+reddit|$)/i
    );
    const query = match?.[1]?.trim();
    return query
      ? `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`
      : 'https://reddit.com';
  }

  // Generic search
  if (lowerCommand.includes('search') || lowerCommand.includes('google')) {
    let query = command
      .replace(/^.*?(?:search|google)[:\s]*/gi, '')
      .replace(/^(?:go to|for|on|in|to|and|then)[\s]*/gi, '')
      .trim();
    if (!query) {
      const m = command.match(/(?:search|find|look up)[\s]+(.+)/i);
      query = m?.[1]?.trim() || command;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  // Check for URL entity
  const urlMatch = command.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/i);
  if (urlMatch) return urlMatch[0];

  // Default - search the command
  return `https://www.google.com/search?q=${encodeURIComponent(command)}`;
}

startServer();
