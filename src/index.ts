import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import { getUserFromRequest } from './auth/getUserFromRequest';
import { createYoga } from 'graphql-yoga';
import { AppDataSource } from './data-source';
import { buildSchema } from 'type-graphql';
import { NewsArticle } from './entities/NewsArticle';
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
import { ollamaRepair, RepairResult } from './ai/OllamaRepairService';
import { createOllamaAdapter } from './ai/adapters/OllamaAdapter';
import { websiteRouter } from './ai/WebsiteRouter';

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
        '⚠️ Ollama has no models. Run "ollama pull tinyllama" to download a model.'
      );
      return;
    }

    // Use configured model or default to mistral (better quality than tinyllama)
    const configuredModel = process.env.OLLAMA_MODEL || 'mistral';

    // Prefer better models over tinyllama
    const modelPriority = ['mistral', 'llama3', 'phi3', 'gemma2', 'tinyllama'];
    let model: string | undefined;
    
    for (const priority of modelPriority) {
      const found = availableModels.find((m) => m.toLowerCase().includes(priority));
      if (found) {
        model = found;
        break;
      }
    }
    
    if (!model) {
      model = availableModels.find((m) => m.startsWith(configuredModel));
    }
    if (!model) {
      model = availableModels[0]; // Fallback to first available
    }

    await ollama.initialize({ baseUrl, model });
    const selectedModel = model;
    
    if (await ollama.isHealthy()) {
      // Test the model to ensure it's working (catches corruption issues)
      console.log(`[Ollama] Testing model ${selectedModel}...`);
      const testResult = await ollama.testModel();
      
      if (testResult.success) {
        await adapterFactory.registerAdapter(AIProvider.OPEN_SOURCE, ollama);
        configuredProviders.set(AIProvider.OPEN_SOURCE, { baseUrl, model: selectedModel });
        console.log(`✅ Ollama adapter initialized (model: ${selectedModel})`);
      } else if (testResult.repairTriggered) {
        console.log(`[Ollama] Auto-repair triggered for model ${selectedModel}`);
        // Re-test after repair
        await new Promise(resolve => setTimeout(resolve, 5000));
        const retest = await ollama.testModel();
        if (retest.success) {
          await adapterFactory.registerAdapter(AIProvider.OPEN_SOURCE, ollama);
          configuredProviders.set(AIProvider.OPEN_SOURCE, { baseUrl, model: selectedModel });
          console.log(`✅ Ollama adapter initialized after repair (model: ${selectedModel})`);
        } else {
          console.log(`[Ollama] Repair did not fix the issue: ${retest.error}`);
          console.log(`[Ollama] Users can try /api/ollama/repair endpoint for manual repair`);
        }
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.log(
      '⚠️ Ollama not available:',
      errorMsg
    );
    // Try to repair even on initial failure
    if (errorMsg.includes('CUDA') || errorMsg.includes('GPU') || errorMsg.includes('runner')) {
      console.log('[Ollama] Attempting auto-repair on startup...');
      const repairResult = await ollamaRepair.performRepair({ 
        autoRepair: true, 
        allowReinstall: true,
        modelToTest: 'mistral'
      });
      if (repairResult.success) {
        console.log('[Ollama] Startup repair successful!');
      } else {
        console.log('[Ollama] Startup repair failed:', repairResult.userMessage);
      }
    }
  }

  // Start health monitoring
  adapterFactory.startHealthMonitoring(30000);

  // Initialize browser agent with Ollama
  await browserAgent.initialize(AIProvider.OPEN_SOURCE);
  console.log('✅ Browser Agent initialized');
}

async function startServer() {
  try {
    await AppDataSource.initialize();
    if (process.env.NODE_ENV !== 'production') {
      console.log('📡 NEXUS database connected');
    }

    // Initialize AI providers
    await initializeAIProviders();

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
    app.use('/graphql', yoga as any);

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

        // For navigation intents - open browser immediately, do context async
        if (intentResult.intent === AIIntentType.NAVIGATE_URL) {
          const route = websiteRouter.route(command);
          console.log('[Ask Rev] Routing to:', route.website, 'URL:', route.url);
          if (route.query) {
            console.log('[Ask Rev] Search query:', route.query);
          }

          // Return immediately - open browser window now, context async
          return res.json({
            success: true,
            url: route.url,
            website: route.website,
            intent: intentResult.intent,
            context: route.query 
              ? `Searching ${route.website} for "${route.query}"...`
              : `Opening ${route.website}...`,
          });
        }

        // For other deterministic tasks, use Browser Agent
        if (
          intentResult.intent === AIIntentType.DETERMINISTIC_AUTOMATION ||
          intentResult.intent === AIIntentType.FORM_FILLING ||
          intentResult.intent === AIIntentType.SCREEN_SCRAPE ||
          intentResult.classification === IntentClassification.DETERMINISTIC
        ) {
          console.log('[Ask Rev] Using Browser Agent for automation...');

          try {
            const agentResult = await browserAgent.executeTask(command);

            if (agentResult.success && agentResult.results) {
              let screenshot = null;
              try {
                const ssRes = await fetch(
                  'http://localhost:9222/api/screenshot',
                  { method: 'POST' }
                );
                const ssData = await ssRes.json();
                screenshot = ssData.screenshot;
              } catch {}

              return res.json({
                success: true,
                executed: true,
                actions: agentResult.actions.map((a) => a.description),
                steps: agentResult.results,
                screenshot,
                intent: intentResult.intent,
                message: `Executed ${agentResult.actions.length} browser actions`,
                context: agentResult.context || null,
              });
            }
          } catch (agentError) {
            console.error('[Ask Rev] Browser agent error:', agentError);
            // Fallback to website router
            const route = websiteRouter.route(command);
            return res.json({
              success: true,
              url: route.url,
              website: route.website,
              command,
              intent: intentResult.intent,
              confidence: intentResult.confidence,
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

    // Ollama diagnostics and repair endpoint
    app.get('/api/ollama/diagnostics', async (req, res) => {
      try {
        const ollamaAdapter = createOllamaAdapter({
          baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
          model: process.env.OLLAMA_MODEL || 'llama3',
        });
        const diagnostics = await ollamaAdapter.getDiagnostics();
        res.json(diagnostics);
      } catch (error) {
        res.json({
          healthy: false,
          running: false,
          modelsAvailable: [],
          modelTested: false,
          modelTestSuccess: false,
          lastError: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Trigger Ollama repair (for when users report issues)
    app.post('/api/ollama/repair', async (req, res) => {
      console.log('[API] Ollama repair requested');
      try {
        const result: RepairResult = await ollamaRepair.performRepair({
          autoRepair: true,
          allowReinstall: true,
          modelToTest: process.env.OLLAMA_MODEL || 'llama3'
        });
        
        if (result.success) {
          console.log('[API] Ollama repair successful:', result.actionsPerformed);
        } else {
          console.log('[API] Ollama repair failed:', result.userMessage);
        }
        
        res.json({
          success: result.success,
          repairType: result.repairType,
          actions: result.actionsPerformed,
          userMessage: result.userMessage,
          requiresRestart: result.requiresRestart,
          userActionRequired: result.userActionRequired
        });
      } catch (error) {
        console.error('[API] Ollama repair error:', error);
        res.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          userMessage: 'Repair failed. Please try restarting the app or reinstalling Ollama manually.'
        });
      }
    });

    const newsIngestionService = new NewsIngestionService();

    // Get news articles
    app.get('/api/news', async (req, res) => {
      try {
        const source = req.query.source as string;
        const typeParam = req.query.type as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        let newsTypeValue: string | undefined;
        if (typeParam === 'video') {
          newsTypeValue = 'video';
        } else if (typeParam === 'article') {
          newsTypeValue = 'article';
        }

        const news = await newsIngestionService.getNews({
          source,
          typeValue: newsTypeValue,
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

        if (articleId) {
          const article = await newsIngestionService.getArticleById(articleId);
          if (article) {
            articleTitle = article.title;
            articleSummary = article.summary || '';
            articleContent = article.content || '';
          }
        }

        const contentToSummarize =
          articleTitle + '\n\n' + (articleSummary || articleContent);

        if (!contentToSummarize.trim()) {
          return res.json({
            success: false,
            error: 'No content available to summarize',
          });
        }

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

        const summaryPrompt = `Please provide a brief summary of the following article (2-3 sentences max). Focus on the main points and key takeaways:\n\n${contentToSummarize.substring(0, 4000)}`;

        const aiResponse = await adapter.complete({
          provider,
          prompt: summaryPrompt,
          maxTokens: 300,
        });

        const aiSummary = aiResponse.content;

        if (articleId) {
          const article = await newsIngestionService.getArticleById(articleId);
          if (article) {
            article.aiSummary = aiSummary;
            await AppDataSource.getRepository(NewsArticle).save(article);
          }
        }

        res.json({
          success: true,
          summary: aiSummary,
          title: articleTitle,
          provider: provider,
        });
      } catch (error) {
        console.error('[News] Error summarizing article:', error);
        res.json({ success: false, error: 'Failed to summarize' });
      }
    });

    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🧠 NEXUS core listening on http://localhost:${PORT}`);
        console.log(`🚀 GraphQL ready at http://localhost:${PORT}/graphql`);
      }
    });
  } catch (error) {
    console.error('DB init error:', error);
  }
}

startServer();
