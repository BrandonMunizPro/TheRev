/**
 * AI Task Worker Entry Point
 * Processes tasks from the Redis queue using AI adapters
 *
 * Usage: npx ts-node src/worker.ts
 *        or: npm run worker
 */

import 'reflect-metadata';
import 'dotenv/config';
import { AppDataSource } from './data-source';
import {
  AITaskQueueManager,
  AITaskMessage,
} from './cache/redis/AITaskQueueManager';
import { RedisClusterManager } from './cache/redis/RedisClusterManager';
import { adapterFactory } from './ai/adapters';
import { AIProvider, TaskType } from './ai/AIIntentTypes';
import { v4 as uuidv4 } from 'uuid';
import { ErrorHandler } from './errors/ErrorHandler';

interface WorkerConfig {
  workerId: string;
  concurrency: number;
  pollIntervalMs: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: WorkerConfig = {
  workerId: `worker-${uuidv4().substring(0, 8)}`,
  concurrency: 3,
  pollIntervalMs: 1000,
  maxRetries: 3,
};

class AITaskWorker {
  private config: WorkerConfig;
  private queueManager: AITaskQueueManager | null = null;
  private isRunning = false;
  private activeTasks: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    console.log(`[Worker ${this.config.workerId}] Starting...`);

    // Initialize database
    await AppDataSource.initialize();
    console.log('[Worker] Database connected');

    // Initialize Redis - simplified config
    const redis = new RedisClusterManager({
      nodes: [{ host: 'localhost', port: 6379 }],
      options: { enableReadyCheck: true },
      monitoring: {
        enabled: false,
        healthCheckInterval: 30000,
        metricsCollectionInterval: 60000,
        alertThresholds: {
          memoryUsage: 80,
          cpuUsage: 80,
          connectionCount: 100,
          queueDepth: 1000,
          responseTime: 1000,
          errorRate: 10,
        },
      },
    });
    await redis.initialize();
    console.log('[Worker] Redis connected');

    // Initialize queue manager
    this.queueManager = new AITaskQueueManager(redis);
    await this.queueManager.registerQueue({
      name: 'ai-tasks',
      maxRetries: this.config.maxRetries,
      visibilityTimeout: 300000,
      retryDelay: 1000,
      messageRetention: 86400,
      maxConcurrency: this.config.concurrency,
    });
    console.log('[Worker] Queue manager initialized');

    // Initialize AI adapters
    await this.initializeAIAdapters();
    console.log('[Worker] AI adapters ready');

    // Register processor
    await this.queueManager.registerProcessor('ai-tasks', {
      process: (message) => this.processTask(message),
    });

    this.isRunning = true;
    console.log(`[Worker ${this.config.workerId}] Started successfully`);
    console.log(`[Worker] Concurrency: ${this.config.concurrency}`);

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async initializeAIAdapters(): Promise<void> {
    // Initialize adapters based on environment variables
    if (process.env.OPENAI_API_KEY) {
      const { ChatGPTAdapter } = await import('./ai/adapters/ChatGPTAdapter');
      const adapter = new ChatGPTAdapter();
      await adapter.initialize({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
      });
      adapterFactory.registerAdapter(AIProvider.CHATGPT, adapter);
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const { ClaudeAdapter } = await import('./ai/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter();
      await adapter.initialize({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      });
      adapterFactory.registerAdapter(AIProvider.CLAUDE, adapter);
    }

    if (process.env.GEMINI_API_KEY) {
      const { GeminiAdapter } = await import('./ai/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter();
      await adapter.initialize({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
      });
      adapterFactory.registerAdapter(AIProvider.GEMINI, adapter);
    }

    // Ollama for local
    try {
      const { OllamaAdapter } = await import('./ai/adapters/OllamaAdapter');
      const adapter = new OllamaAdapter();
      await adapter.initialize({
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'phi3:latest',
        autoPullModel: true,
      });
      adapterFactory.registerAdapter(AIProvider.OPEN_SOURCE, adapter);
      console.log('[Worker] Ollama adapter initialized');
    } catch (e) {
      console.log(
        '[Worker] Ollama initialization failed:',
        e instanceof Error ? e.message : e
      );
    }
  }

  async processTask(message: AITaskMessage): Promise<{
    success: boolean;
    result?: any;
    error?: Error;
    retryable: boolean;
  }> {
    const startTime = Date.now();
    console.log(
      `[Worker ${this.config.workerId}] Processing task ${message.id}`
    );

    try {
      const { taskType, payload, metadata } = message;

      // Determine provider based on task type or user preference
      let provider = metadata?.provider
        ? AIProvider[metadata.provider as keyof typeof AIProvider]
        : AIProvider.OPEN_SOURCE;

      // Fallback to available provider
      if (!adapterFactory.getAdapter(provider)) {
        provider = this.getBestAvailableProvider();
      }

      const adapter = adapterFactory.getAdapter(provider);
      if (!adapter) {
        throw ErrorHandler.serviceUnavailable('No AI adapter available');
      }

      let result: string;
      const taskTypeStr = taskType?.toLowerCase() || '';

      if (
        taskTypeStr.includes('generation') ||
        taskTypeStr.includes('generate') ||
        taskTypeStr.includes('write') ||
        taskTypeStr.includes('create')
      ) {
        const genResponse = await adapter.complete({
          provider,
          prompt: payload.prompt || payload.text || '',
          systemPrompt: payload.systemPrompt,
          temperature: payload.temperature ?? 0.7,
          maxTokens: payload.maxTokens ?? 2000,
        });
        result = genResponse.content;
      } else if (
        taskTypeStr.includes('summar') ||
        taskTypeStr === 'summarize'
      ) {
        const sumResponse = await adapter.complete({
          provider,
          prompt: `Summarize the following content:\n\n${payload.text || ''}`,
          systemPrompt:
            'You are a summarization expert. Provide concise, accurate summaries.',
          temperature: 0.3,
          maxTokens: 500,
        });
        result = sumResponse.content;
      } else if (
        taskTypeStr.includes('classif') ||
        taskTypeStr === 'classify'
      ) {
        const clsResponse = await adapter.complete({
          provider,
          prompt: `Classify the following text into categories: ${payload.categories?.join(', ') || 'positive, negative, neutral'}\n\nText: ${payload.text || ''}`,
          temperature: 0.2,
          maxTokens: 100,
        });
        result = clsResponse.content;
      } else if (taskTypeStr.includes('anal') || taskTypeStr === 'analyze') {
        const anaResponse = await adapter.complete({
          provider,
          prompt:
            payload.prompt || `Analyze the following:\n\n${payload.text || ''}`,
          systemPrompt:
            'You are a data analysis expert. Provide detailed, accurate analysis.',
          temperature: 0.4,
          maxTokens: 2000,
        });
        result = anaResponse.content;
      } else {
        // Generic AI task
        const genericResponse = await adapter.complete({
          provider,
          prompt: payload.prompt || payload.text || '',
          systemPrompt: payload.systemPrompt,
          temperature: payload.temperature ?? 0.7,
          maxTokens: payload.maxTokens ?? 2000,
        });
        result = genericResponse.content;
      }

      const processingTime = Date.now() - startTime;
      console.log(
        `[Worker ${this.config.workerId}] Task ${message.id} completed in ${processingTime}ms`
      );

      return {
        success: true,
        result: {
          output: result,
          provider: provider,
          processingTimeMs: processingTime,
        },
        retryable: false,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `[Worker ${this.config.workerId}] Task ${message.id} failed:`,
        error
      );

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        retryable: true,
      };
    }
  }

  private getBestAvailableProvider(): AIProvider {
    const providers = [
      AIProvider.OPEN_SOURCE,
      AIProvider.CHATGPT,
      AIProvider.CLAUDE,
      AIProvider.GEMINI,
    ];

    for (const provider of providers) {
      const adapter = adapterFactory.getAdapter(provider);
      if (adapter) {
        return provider;
      }
    }

    return AIProvider.DETERMINISTIC;
  }

  async shutdown(): Promise<void> {
    console.log(`[Worker ${this.config.workerId}] Shutting down...`);
    this.isRunning = false;

    const activeCount = this.activeTasks.size;
    if (activeCount > 0) {
      console.log(
        `[Worker] Waiting for ${activeCount} active tasks to complete...`
      );
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    if (this.queueManager) {
      await this.queueManager.shutdown();
    }

    await AppDataSource.destroy();
    console.log(`[Worker ${this.config.workerId}] Shutdown complete`);
    process.exit(0);
  }

  getStatus() {
    return {
      workerId: this.config.workerId,
      isRunning: this.isRunning,
      activeTasks: this.activeTasks.size,
      concurrency: this.config.concurrency,
    };
  }
}

// Run worker
const config: Partial<WorkerConfig> = {};

if (process.argv.includes('--worker-id')) {
  const idx = process.argv.indexOf('--worker-id');
  config.workerId = process.argv[idx + 1];
}

if (process.argv.includes('--concurrency')) {
  const idx = process.argv.indexOf('--concurrency');
  config.concurrency = parseInt(process.argv[idx + 1], 10);
}

const worker = new AITaskWorker(config);
worker.start().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});

export { AITaskWorker };
