/**
 * AI Task Queue Manager using Redis - Fixed Version
 * Provides priority-based AI task queuing with retry logic,
 * dead letter queues, and comprehensive monitoring
 */

import { EventEmitter } from 'events';
import {
  RedisQueuePriority,
  AITaskQueueConfig,
  RedisQueueMetrics,
} from './RedisTypes';
import { v4 as uuidv4 } from 'uuid';
import {
  SystemError,
  ValidationError,
  DATABASE_ERROR,
} from '../../errors/AppError';

export interface AITaskMessage {
  id: string;
  userId: string;
  taskType: string;
  priority: RedisQueuePriority;
  payload: any;
  maxRetries: number;
  retryCount: number;
  createdAt: Date;
  scheduledAt?: Date;
  timeout: number;
  metadata?: {
    provider?: string;
    fallbackStrategy?: any;
    requestId?: string;
  };
}


export interface QueueProcessor {
  process(message: AITaskMessage): Promise<ProcessingResult>;
}

export interface ProcessingResult {
  success: boolean;
  result?: any;
  error?: Error;
  retryable: boolean;
  nextRetryAt?: Date;
}

/**
 * AI Task Queue Manager Implementation
 */
export class AITaskQueueManager extends EventEmitter {
  private redis: any; // Will be Redis cluster
  private queues: Map<string, AITaskQueueConfig> = new Map();
  private processors: Map<string, QueueProcessor> = new Map();
  private isProcessing = false;
  private processingTimers: Map<string, NodeJS.Timeout> = new Map();
  private metrics: Map<string, RedisQueueMetrics> = new Map();

  constructor(redis: any) {
    super();
    this.redis = redis;
  }

  async registerQueue(config: AITaskQueueConfig): Promise<void> {
    try {
      this.validateQueueConfig(config);
      await this.createQueueStructures(config);
      this.queues.set(config.name, config);
      this.initializeMetrics(config.name);

      console.log(`Registered AI task queue: ${config.name}`);
      this.emit('queue:registered', { queueName: config.name, config });
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to register queue ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'queueName',
          value: config.name,
          action: 'registerQueue',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Add task to queue with priority
   */
  async enqueueTask(task: Partial<AITaskMessage>): Promise<string> {
    try {
      const message: AITaskMessage = {
        id: task.id || uuidv4(),
        userId: task.userId!,
        taskType: task.taskType!,
        priority: task.priority || RedisQueuePriority.NORMAL,
        payload: task.payload,
        maxRetries: task.maxRetries || 3,
        retryCount: 0,
        createdAt: new Date(),
        timeout: task.timeout || 300000,
        metadata: task.metadata,
        scheduledAt: task.scheduledAt || new Date(),
      };

      await this.addMessageToQueue(message);

      console.log(
        `Enqueued AI task: ${message.id} (priority: ${message.priority})`
      );
      this.emit('task:enqueued', { message });

      this.updateQueueMetrics(message.taskType, 'enqueued');

      return message.id;
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to enqueue task: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          action: 'enqueueTask',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Get next task from queue (blocking)
   */
  async dequeueTask(queueName: string): Promise<AITaskMessage | null> {
    try {
      const config = this.queues.get(queueName);
      if (!config) {
        throw new ValidationError(`Queue not found: ${queueName}`, {
          field: 'queueName',
          value: queueName,
          action: 'dequeue',
        });
      }

      const priorities = [0, 1, 2, 3, 4] as const;
      for (const priority of priorities) {
        const priorityQueue = `${queueName}:priority:${priority}`;
        const message = await this.redis.bzpopmax(priorityQueue, 1);

        if (message) {
          const taskMessage: AITaskMessage = JSON.parse(message[1]);
          taskMessage.retryCount++;

          console.log(`Dequeued AI task: ${taskMessage.id}`);
          this.emit('task:dequeued', { queueName, message: taskMessage });

          this.updateQueueMetrics(queueName, 'dequeued');

          return taskMessage;
        }
      }

      return null;
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to dequeue task from ${queueName}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'queueName',
          value: queueName,
          action: 'dequeue',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Register a processor for a queue
   */
  async registerProcessor(
    queueName: string,
    processor: QueueProcessor
  ): Promise<void> {
    const config = this.queues.get(queueName);
    if (!config) {
      throw new ValidationError(
        `Cannot register processor for unknown queue: ${queueName}`,
        {
          field: 'queueName',
          value: queueName,
          action: 'registerProcessor',
        }
      );
    }

    this.processors.set(queueName, processor);
    if (!this.isProcessing) {
      this.startProcessing();
    }

    console.log(`Registered processor for queue: ${queueName}`);
  }

  async completeTask(
    queueName: string,
    taskId: string,
    result?: any
  ): Promise<void> {
    try {
      await this.redis.hdel(`${queueName}:active`, taskId);
      this.updateQueueMetrics(queueName, 'completed');

      console.log(`Completed AI task: ${taskId}`);
      this.emit('task:completed', { queueName, taskId, result });
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to complete task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          action: 'completeTask',
          field: 'taskId',
          value: taskId,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Mark task as failed (with retry logic)
   */
  async failTask(
    queueName: string,
    taskId: string,
    error: Error,
    processingResult?: ProcessingResult
  ): Promise<void> {
    try {
      const activeTask = await this.redis.hget(`${queueName}:active`, taskId);
      if (!activeTask) {
        console.warn(`Task not found in active queue: ${taskId}`);
        return;
      }

      const task: AITaskMessage = JSON.parse(activeTask);
      const shouldRetry =
        processingResult?.retryable ??
        (task.retryCount < task.maxRetries && error.name !== 'ValidationError');

      if (shouldRetry) {
        const retryDelay = this.calculateRetryDelay(task.retryCount);
        const retryAt = new Date(Date.now() + retryDelay);

        task.retryCount++;
        task.scheduledAt = retryAt;

        await this.redis.zadd(
          `${queueName}:delayed`,
          retryAt.getTime(),
          JSON.stringify(task)
        );

        console.log(`Scheduled retry for task ${taskId} at ${retryAt}`);
        this.emit('task:retry-scheduled', { queueName, taskId, retryAt });
      } else {
        await this.moveToDeadLetterQueue(queueName, task, error);
        console.log(`Moved task to dead letter queue: ${taskId}`);
        this.emit('task:dead-lettered', { queueName, taskId, error });
      }

      await this.redis.hdel(`${queueName}:active`, taskId);
      this.updateQueueMetrics(queueName, 'failed');
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to handle task failure for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          action: 'failTask',
          field: 'taskId',
          value: taskId,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async getQueueMetrics(queueName: string): Promise<RedisQueueMetrics | null> {
    try {
      const config = this.queues.get(queueName);
      if (!config) return null;

      let waiting = 0;
      let active = 0;
      let completed = 0;
      let failed = 0;

      const priorities = [0, 1, 2, 3, 4] as const;
      for (const priority of priorities) {
        try {
          waiting +=
            (await this.redis.zcard(`${queueName}:priority:${priority}`)) || 0;
        } catch (e) {
          console.warn(`Failed to get priority ${priority} queue count: ${e}`);
        }
      }

      try {
        active = await this.redis.hlen(`${queueName}:active`);
      } catch (e) {
        console.warn(`Failed to get active task count: ${e}`);
        active = 0;
      }

      try {
        const completedValue = await this.redis.get(
          `${queueName}:metrics:completed`
        );
        completed = parseInt(String(completedValue || '0'));
      } catch (e) {
        console.warn(`Failed to get completed count: ${e}`);
        completed = 0;
      }

      try {
        const failedValue = await this.redis.get(`${queueName}:metrics:failed`);
        failed = parseInt(String(failedValue || '0'));
      } catch (e) {
        console.warn(`Failed to get failed count: ${e}`);
        failed = 0;
      }

      const metrics: RedisQueueMetrics = {
        queueName,
        waiting,
        active,
        completed,
        failed,
        averageProcessingTime: 0,
        throughput: 0,
      };

      return metrics;
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to get queue metrics for ${queueName}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'queueName',
          value: queueName,
          action: 'getQueueMetrics',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Start processing queues
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    console.log('Starting AI task queue processing...');

    for (const [queueName, config] of this.queues) {
      const processor = this.processors.get(queueName);
      if (processor) {
        this.startQueueProcessor(queueName, config, processor);
      }
    }
  }

  /**
   * Start processing a specific queue
   */
  private startQueueProcessor(
    queueName: string,
    config: AITaskQueueConfig,
    processor: QueueProcessor
  ): void {
    const processNext = async (): Promise<void> => {
      try {
        await this.processDelayedTasks(queueName);
        const task = await this.dequeueTask(queueName);
        if (!task) {
          this.scheduleNextProcess(queueName, 1000);
          return;
        }

        await this.redis.hset(
          `${queueName}:active`,
          task.id,
          JSON.stringify(task)
        );

        const timeout = setTimeout(async (): Promise<void> => {
          await this.failTask(queueName, task.id, new Error('Task timeout'), {
            success: false,
            retryable: true,
          });
        }, task.timeout);

        this.processingTimers.set(task.id, timeout);

        try {
          const result = await processor.process(task);

          clearTimeout(timeout);
          this.processingTimers.delete(task.id);

          if (result.success) {
            await this.completeTask(queueName, task.id, result.result);
          } else if (result.retryable && task.retryCount < task.maxRetries) {
            await this.failTask(
              queueName,
              task.id,
              result.error || new Error('Task failed'),
              result
            );
          } else {
            await this.failTask(
              queueName,
              task.id,
              result.error || new Error('Task failed'),
              result
            );
          }

          this.scheduleNextProcess(queueName, 100);
        } catch (processingError: unknown) {
          clearTimeout(timeout);
          this.processingTimers.delete(task.id);

          const errorMessage =
            processingError instanceof Error
              ? processingError.message
              : String(processingError);
          await this.failTask(queueName, task.id, new Error(errorMessage), {
            success: false,
            retryable: true,
          });

          this.scheduleNextProcess(queueName, 5000);
        }
      } catch (error: unknown) {
        console.error(`Queue processor error for ${queueName}:`, error);
        this.scheduleNextProcess(queueName, 5000);
      }
    };

    processNext();
  }

  /**
   * Process delayed tasks (scheduled for retry)
   */
  private async processDelayedTasks(queueName: string): Promise<void> {
    const now = Date.now();
    const delayedTasks = await this.redis.zrangebyscore(
      `${queueName}:delayed`,
      0,
      now
    );

    for (const taskStr of delayedTasks) {
      const task: AITaskMessage = JSON.parse(taskStr);
      await this.addMessageToQueue(task);
    }

    if (delayedTasks.length > 0) {
      await this.redis.zremrangebyscore(`${queueName}:delayed`, 0, now);
    }
  }

  /**
   * Add message to appropriate priority queue
   */
  private async addMessageToQueue(message: AITaskMessage): Promise<void> {
    const score = message.createdAt.getTime();
    const queueName = `${message.taskType}:priority:${message.priority}`;
    await this.redis.zadd(queueName, score, JSON.stringify(message));
  }

  /**
   * Move failed task to dead letter queue
   */
  private async moveToDeadLetterQueue(
    queueName: string,
    task: AITaskMessage,
    error: Error
  ): Promise<void> {
    const deadLetterMessage = {
      originalTask: task,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      failedAt: new Date(),
      retryCount: task.retryCount,
    };

    await this.redis.lpush(
      `${queueName}:dlq`,
      JSON.stringify(deadLetterMessage)
    );
  }

  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = 1000;
    const maxDelay = 30000;
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  }

  /**
   * Schedule next processing cycle for a queue
   */
  private scheduleNextProcess(queueName: string, delayMs: number): void {
    const existingTimer = this.processingTimers.get(`${queueName}:schedule`);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async (): Promise<void> => {
      const processor = this.processors.get(queueName);
      const config = this.queues.get(queueName);
      if (processor && config) {
        this.startQueueProcessor(queueName, config, processor);
      }
    }, delayMs);

    this.processingTimers.set(`${queueName}:schedule`, timer);
  }

  /**
   * Initialize metrics for a queue
   */
  private initializeMetrics(queueName: string): void {
    this.metrics.set(queueName, {
      queueName,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      averageProcessingTime: 0,
      throughput: 0,
    });
  }

  /**
   * Update queue metrics
   */
  private updateQueueMetrics(
    queueName: string,
    action: 'enqueued' | 'dequeued' | 'completed' | 'failed'
  ): void {
    const metrics = this.metrics.get(queueName);
    if (!metrics) return;

    switch (action) {
      case 'enqueued':
        metrics.waiting++;
        break;
      case 'dequeued':
        metrics.waiting = Math.max(0, metrics.waiting - 1);
        metrics.active++;
        break;
      case 'completed':
        metrics.active = Math.max(0, metrics.active - 1);
        metrics.completed++;
        break;
      case 'failed':
        metrics.active = Math.max(0, metrics.active - 1);
        metrics.failed++;
        break;
    }
  }

  /**
   * Create queue structures in Redis
   */
  private async createQueueStructures(
    config: AITaskQueueConfig
  ): Promise<void> {
    for (let priority = 0; priority <= 4; priority++) {
      await this.redis.zadd(`${config.name}:priority:${priority}`, 0, '{}');
    }

    await this.redis.hset(`${config.name}:active`, 'init', '{}');
    await this.redis.hdel(`${config.name}:active`, 'init');

    await this.redis.zadd(`${config.name}:delayed`, 0, '{}');
    await this.redis.zrem(`${config.name}:delayed`, '{}');

    await this.redis.lpush(`${config.name}:dlq`, '{}');
    await this.redis.lpop(`${config.name}:dlq`);
  }

  private validateQueueConfig(config: AITaskQueueConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new ValidationError('Queue name is required', {
        field: 'name',
        value: config.name,
      });
    }

    if (config.maxRetries < 0 || config.maxRetries > 10) {
      throw new ValidationError('Max retries must be between 0 and 10', {
        field: 'maxRetries',
        value: config.maxRetries,
      });
    }

    if (config.visibilityTimeout < 1000) {
      throw new ValidationError('Visibility timeout must be at least 1000ms', {
        field: 'visibilityTimeout',
        value: config.visibilityTimeout,
      });
    }
  }

  /**
   * Gracefully shutdown queue processing
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down AI task queue processing...');

    for (const [name, timer] of this.processingTimers) {
      clearTimeout(timer);
    }
    this.processingTimers.clear();

    this.isProcessing = false;
    console.log('AI task queue processing shutdown complete');
  }
}
