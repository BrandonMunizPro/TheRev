import { TaskPriority } from './TaskPriorityTypes';

export enum AITaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum AITaskType {
  GENERATION = 'generation',
  ANALYSIS = 'analysis',
  AUTOMATION = 'automation',
  RESEARCH = 'research',
  SUMMARIZATION = 'summarization',
  TRANSLATION = 'translation',
}

export interface AITask {
  id: string;
  userId: string;
  type: AITaskType;
  status: AITaskStatus;
  intent: string;
  input: AITaskInput;
  output?: AITaskOutput;
  provider: string;
  priority: TaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  retryCount: number;
  maxRetries: number;
  error?: string;
  metadata: AITaskMetadata;
}

export interface AITaskInput {
  prompt?: string;
  context?: Record<string, unknown>;
  entities?: Array<{ type: string; value: string }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AITaskOutput {
  content: string;
  tokensUsed?: number;
  finishReason: string;
  model?: string;
}

export interface AITaskMetadata {
  avatarId?: string;
  threadId?: string;
  postId?: string;
  parentTaskId?: string;
  idempotencyKey?: string;
  userPreferences?: {
    preferredProvider?: string;
    allowBrowserAutomation?: boolean;
  };
  routingReason?: string;
  fallbackUsed?: boolean;
  failureReason?: string;
}

export interface AITaskFilter {
  userId?: string;
  status?: AITaskStatus | AITaskStatus[];
  type?: AITaskType | AITaskType[];
  provider?: string;
  priority?: TaskPriority;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface AITaskSummary {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  byProvider: Record<string, number>;
  avgDurationMs: number;
}
