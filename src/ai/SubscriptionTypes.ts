export enum SubscriptionEventType {
  TASK_STATUS_CHANGED = 'task_status_changed',
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_QUEUED = 'task_queued',
}

export interface TaskSubscription {
  userId: string;
  taskId: string;
  eventTypes: SubscriptionEventType[];
  callbackUrl?: string;
  webhookSecret?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface SubscriptionEvent {
  type: SubscriptionEventType;
  taskId: string;
  userId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface SubscriptionFilter {
  userId?: string;
  taskId?: string;
  eventType?: SubscriptionEventType;
}

export interface WebhookPayload {
  event: SubscriptionEvent;
  signature?: string;
  timestamp: number;
}

export interface ProgressUpdate {
  taskId: string;
  progress: number;
  message?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
}
