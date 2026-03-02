import {
  TaskSubscription,
  SubscriptionEvent,
  SubscriptionEventType,
  SubscriptionFilter,
  WebhookPayload,
  ProgressUpdate,
} from './SubscriptionTypes';
import { AITask, AITaskStatus } from './AITaskTypes';

type EventCallback = (event: SubscriptionEvent) => void | Promise<void>;

export interface ISubscriptionRepository {
  subscribe(subscription: TaskSubscription): Promise<void>;
  unsubscribe(userId: string, taskId: string): Promise<void>;
  findByFilter(filter: SubscriptionFilter): Promise<TaskSubscription[]>;
  findByTaskId(taskId: string): Promise<TaskSubscription[]>;
}

export interface TaskSubscriptionConfig {
  enableWebhooks: boolean;
  webhookTimeoutMs: number;
  maxWebhookRetries: number;
  eventExpiryHours: number;
}

export const DEFAULT_SUBSCRIPTION_CONFIG: TaskSubscriptionConfig = {
  enableWebhooks: false,
  webhookTimeoutMs: 5000,
  maxWebhookRetries: 3,
  eventExpiryHours: 24,
};

export class TaskSubscriptionService {
  private repository: ISubscriptionRepository;
  private config: TaskSubscriptionConfig;
  private callbacks: Map<string, Set<EventCallback>> = new Map();
  private inMemorySubscriptions: Map<string, TaskSubscription> = new Map();

  constructor(
    repository: ISubscriptionRepository,
    config?: Partial<TaskSubscriptionConfig>
  ) {
    this.repository = repository;
    this.config = { ...DEFAULT_SUBSCRIPTION_CONFIG, ...config };
  }

  async subscribe(
    userId: string,
    taskId: string,
    eventTypes: SubscriptionEventType[],
    callbackUrl?: string,
    webhookSecret?: string
  ): Promise<TaskSubscription> {
    const subscription: TaskSubscription = {
      userId,
      taskId,
      eventTypes,
      callbackUrl,
      webhookSecret,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.eventExpiryHours * 60 * 60 * 1000),
    };

    await this.repository.subscribe(subscription);
    this.inMemorySubscriptions.set(`${userId}:${taskId}`, subscription);

    return subscription;
  }

  async unsubscribe(userId: string, taskId: string): Promise<void> {
    await this.repository.unsubscribe(userId, taskId);
    this.inMemorySubscriptions.delete(`${userId}:${taskId}`);
    this.callbacks.delete(taskId);
  }

  async onTaskStatusChanged(
    task: AITask,
    previousStatus: AITaskStatus
  ): Promise<void> {
    const eventType = this.mapStatusToEventType(task.status);
    const previousEventType = this.mapStatusToEventType(previousStatus);

    const event: SubscriptionEvent = {
      type: eventType,
      taskId: task.id,
      userId: task.userId,
      timestamp: new Date(),
      payload: {
        taskStatus: task.status,
        previousStatus,
        provider: task.provider,
        priority: task.priority,
        retryCount: task.retryCount,
        actualDuration: task.actualDuration,
      },
    };

    await this.emitEvent(task.id, event);

    if (eventType !== previousEventType) {
      const previousEvent: SubscriptionEvent = {
        type: previousEventType,
        taskId: task.id,
        userId: task.userId,
        timestamp: new Date(),
        payload: {
          taskStatus: task.status,
          provider: task.provider,
        },
      };
      await this.emitEvent(task.id, previousEvent);
    }
  }

  async onTaskProgress(taskId: string, userId: string, progress: ProgressUpdate): Promise<void> {
    const event: SubscriptionEvent = {
      type: SubscriptionEventType.TASK_PROGRESS,
      taskId,
      userId,
      timestamp: new Date(),
      payload: progress as unknown as Record<string, unknown>,
    };

    await this.emitEvent(taskId, event);
  }

  async onTaskCompleted(
    task: AITask,
    output: { content: string; tokensUsed?: number }
  ): Promise<void> {
    const event: SubscriptionEvent = {
      type: SubscriptionEventType.TASK_COMPLETED,
      taskId: task.id,
      userId: task.userId,
      timestamp: new Date(),
      payload: {
        outputLength: output.content.length,
        tokensUsed: output.tokensUsed,
        duration: task.actualDuration,
        provider: task.provider,
      },
    };

    await this.emitEvent(task.id, event);
  }

  async onTaskFailed(
    task: AITask,
    error: string
  ): Promise<void> {
    const event: SubscriptionEvent = {
      type: SubscriptionEventType.TASK_FAILED,
      taskId: task.id,
      userId: task.userId,
      timestamp: new Date(),
      payload: {
        error,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries,
        provider: task.provider,
      },
    };

    await this.emitEvent(task.id, event);
  }

  addCallback(taskId: string, callback: EventCallback): () => void {
    if (!this.callbacks.has(taskId)) {
      this.callbacks.set(taskId, new Set());
    }
    this.callbacks.get(taskId)!.add(callback);

    return () => {
      this.callbacks.get(taskId)?.delete(callback);
    };
  }

  async getSubscriptions(taskId: string): Promise<TaskSubscription[]> {
    return this.repository.findByTaskId(taskId);
  }

  private async emitEvent(taskId: string, event: SubscriptionEvent): Promise<void> {
    const callbacks = this.callbacks.get(taskId);
    if (callbacks) {
      const promises = Array.from(callbacks).map(cb => {
        try {
          const result = cb(event);
          if (result instanceof Promise) {
            return result.catch(err => console.error('Callback error:', err));
          }
        } catch (err) {
          console.error('Callback error:', err);
        }
      });
      await Promise.allSettled(promises);
    }

    const subscriptions = await this.repository.findByTaskId(taskId);
    const now = new Date();
    
    const relevantSubscriptions = subscriptions.filter(sub =>
      sub.eventTypes.includes(event.type) &&
      (!sub.expiresAt || sub.expiresAt > now)
    );

    for (const sub of relevantSubscriptions) {
      if (sub.callbackUrl) {
        this.sendWebhookAsync(sub, event);
      }
    }
  }

  private sendWebhookAsync(subscription: TaskSubscription, event: SubscriptionEvent): void {
    if (!this.config.enableWebhooks || !subscription.callbackUrl) return;

    const payload: WebhookPayload = {
      event,
      timestamp: Date.now(),
    };

    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (subscription.webhookSecret) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(subscription.webhookSecret);
      const messageData = encoder.encode(body);
      
      crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      ).then(cryptoKey => 
        crypto.subtle.sign('HMAC', cryptoKey, messageData)
      ).then(signature => {
        const sig = Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        headers['X-Webhook-Signature'] = sig;
        this.doWebhookRequest(subscription.callbackUrl!, headers, body);
      }).catch(err => {
        console.error('Webhook signature error:', err);
        this.doWebhookRequest(subscription.callbackUrl!, headers, body);
      });
    } else {
      this.doWebhookRequest(subscription.callbackUrl, headers, body);
    }
  }

  private doWebhookRequest(url: string, headers: Record<string, string>, body: string): void {
    for (let attempt = 0; attempt < this.config.maxWebhookRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.webhookTimeoutMs);

        fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        }).then(response => {
          clearTimeout(timeout);
          if (response.ok) {
            return;
          }
        }).catch(() => {});

        return;
      } catch {}
    }
  }

  private async generateSignature(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private mapStatusToEventType(status: AITaskStatus): SubscriptionEventType {
    switch (status) {
      case AITaskStatus.PENDING:
        return SubscriptionEventType.TASK_QUEUED;
      case AITaskStatus.PROCESSING:
        return SubscriptionEventType.TASK_STATUS_CHANGED;
      case AITaskStatus.COMPLETED:
        return SubscriptionEventType.TASK_COMPLETED;
      case AITaskStatus.FAILED:
        return SubscriptionEventType.TASK_FAILED;
      default:
        return SubscriptionEventType.TASK_STATUS_CHANGED;
    }
  }

  updateConfig(config: Partial<TaskSubscriptionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
