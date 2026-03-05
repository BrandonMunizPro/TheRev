import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
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

        // For automation/deterministic tasks, use Browser Agent to execute in browser
        if (
          intentResult.intent === AIIntentType.NAVIGATE_URL ||
          intentResult.intent === AIIntentType.DETERMINISTIC_AUTOMATION ||
          intentResult.intent === AIIntentType.FORM_FILLING ||
          intentResult.intent === AIIntentType.SCREEN_SCRAPE ||
          intentResult.classification === IntentClassification.DETERMINISTIC
        ) {
          console.log('[Ask Rev] Using Browser Agent for automation...');

          try {
            const agentResult = await browserAgent.executeTask(command);

            if (agentResult.success && agentResult.results) {
              // Get screenshot of final state
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
                url: agentResult.results[0]?.result?.url || null,
                context: agentResult.context || null,
              });
            } else {
              // Fallback to URL navigation
              const url = extractNavigationUrl(command, intentResult);
              return res.json({
                success: true,
                url,
                command,
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                fallback: true,
              });
            }
          } catch (agentError) {
            console.error('[Ask Rev] Browser agent error:', agentError);
            // Fallback to simple navigation
            const url = extractNavigationUrl(command, intentResult);
            return res.json({
              success: true,
              url,
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
