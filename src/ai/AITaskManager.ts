import {
  AITask,
  AITaskStatus,
  AITaskType,
  AITaskInput,
  AITaskMetadata,
  AITaskFilter,
  AITaskSummary,
} from './AITaskTypes';
import { TaskPriority, TaskPriorityService, TaskContext } from './TaskPriorityService';
import { IntentClassificationResult } from './AIIntentTypes';

export interface ITaskRepository {
  create(task: AITask): Promise<AITask>;
  findById(id: string): Promise<AITask | null>;
  findByFilter(filter: AITaskFilter): Promise<AITask[]>;
  update(task: AITask): Promise<AITask>;
  updateStatus(id: string, status: AITaskStatus, error?: string): Promise<void>;
  updateStatusAtomic(id: string, expectedStatus: AITaskStatus, newStatus: AITaskStatus): Promise<boolean>;
  delete(id: string): Promise<void>;
  getSummary(userId?: string): Promise<AITaskSummary>;
}

export interface ITaskQueue {
  enqueue(taskId: string, priority: number): Promise<void>;
  dequeue(): Promise<string | null>;
  peek(priority: number): Promise<string | null>;
  remove(taskId: string): Promise<void>;
  getPosition(taskId: string): Promise<number>;
  getQueueLength(): Promise<number>;
}

export interface AITaskManagerConfig {
  maxRetries: number;
  defaultTimeoutMs: number;
  enableAutoRetry: boolean;
  retryDelayMs: number;
}

export const DEFAULT_TASK_MANAGER_CONFIG: AITaskManagerConfig = {
  maxRetries: 3,
  defaultTimeoutMs: 120000,
  enableAutoRetry: true,
  retryDelayMs: 5000,
};

export class AITaskManager {
  private taskRepository: ITaskRepository;
  private taskQueue: ITaskQueue;
  private priorityService: TaskPriorityService;
  private config: AITaskManagerConfig;
  private processingTasks: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    taskRepository: ITaskRepository,
    taskQueue: ITaskQueue,
    priorityService: TaskPriorityService,
    config?: Partial<AITaskManagerConfig>
  ) {
    this.taskRepository = taskRepository;
    this.taskQueue = taskQueue;
    this.priorityService = priorityService;
    this.config = { ...DEFAULT_TASK_MANAGER_CONFIG, ...config };
  }

  async createTask(
    userId: string,
    type: AITaskType,
    intent: IntentClassificationResult,
    input: AITaskInput,
    metadata: AITaskMetadata = {}
  ): Promise<AITask> {
    if (metadata.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(metadata.idempotencyKey, userId);
      if (existing) {
        return existing;
      }
    }

    const taskContext: TaskContext = {
      taskId: '',
      userId,
      taskType: type,
      estimatedDuration: intent.estimatedComplexity === 'complex' ? 30000 : 15000,
      createdAt: new Date(),
    };

    const priorityScore = this.priorityService.calculatePriority(taskContext);

    const task: AITask = {
      id: this.generateTaskId(),
      userId,
      type,
      status: AITaskStatus.PENDING,
      intent: intent.intent,
      input,
      provider: '',
      priority: priorityScore.final,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      metadata: {
        ...metadata,
        routingReason: priorityScore.boosts.length > 0 
          ? `Base priority with boosts: ${priorityScore.boosts.map(b => b.reason).join(', ')}`
          : `Base priority: ${priorityScore.base}`,
      },
    };

    const createdTask = await this.taskRepository.create(task);

    await this.taskQueue.enqueue(createdTask.id, Number(createdTask.priority));

    return createdTask;
  }

  private async findByIdempotencyKey(key: string, userId: string): Promise<AITask | null> {
    const tasks = await this.taskRepository.findByFilter({
      userId,
      limit: 1,
    });
    return tasks.find(t => t.metadata.idempotencyKey === key) || null;
  }

  async getTask(taskId: string): Promise<AITask | null> {
    return this.taskRepository.findById(taskId);
  }

  async getTasksByFilter(filter: AITaskFilter): Promise<AITask[]> {
    return this.taskRepository.findByFilter(filter);
  }

  async startTask(taskId: string, provider: string): Promise<AITask | null> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) return null;

    if (task.status !== AITaskStatus.PENDING && task.status !== AITaskStatus.QUEUED) {
      return null;
    }

    const updatedTask: AITask = {
      ...task,
      status: AITaskStatus.PROCESSING,
      provider,
      startedAt: new Date(),
    };

    const success = await this.taskRepository.updateStatusAtomic(taskId, AITaskStatus.PENDING, AITaskStatus.PROCESSING);
    
    if (!success) {
      return null;
    }

    await this.taskQueue.remove(taskId);

    this.setTaskTimeout(taskId, this.config.defaultTimeoutMs);

    return updatedTask;
  }

  async completeTask(
    taskId: string, 
    output: { content: string; tokensUsed?: number; finishReason: string; model?: string }
  ): Promise<AITask | null> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) return null;

    const completedAt = new Date();
    const actualDuration = task.startedAt 
      ? completedAt.getTime() - task.startedAt.getTime()
      : undefined;

    const updatedTask: AITask = {
      ...task,
      status: AITaskStatus.COMPLETED,
      output: {
        content: output.content,
        tokensUsed: output.tokensUsed,
        finishReason: output.finishReason,
        model: output.model,
      },
      completedAt,
      actualDuration,
    };

    await this.taskRepository.update(updatedTask);

    const timeout = this.processingTasks.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.processingTasks.delete(taskId);
    }

    return updatedTask;
  }

  async failTask(taskId: string, error: string): Promise<AITask | null> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) return null;

    if (task.retryCount < task.maxRetries && this.config.enableAutoRetry) {
      return this.retryTask(task, error);
    }

    const updatedTask: AITask = {
      ...task,
      status: AITaskStatus.FAILED,
      error,
      completedAt: new Date(),
    };

    await this.taskRepository.update(updatedTask);

    const timeout = this.processingTasks.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.processingTasks.delete(taskId);
    }

    return updatedTask;
  }

  private async retryTask(task: AITask, error: string): Promise<AITask> {
    const taskContext: TaskContext = {
      taskId: task.id,
      userId: task.userId,
      taskType: task.type,
      estimatedDuration: task.estimatedDuration || 15000,
      createdAt: task.createdAt,
      retryCount: task.retryCount + 1,
    };

    const priorityScore = this.priorityService.calculatePriority(taskContext);

    const retryTask: AITask = {
      ...task,
      status: AITaskStatus.PENDING,
      retryCount: task.retryCount + 1,
      priority: priorityScore.final,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
    };

    retryTask.metadata = {
      ...retryTask.metadata,
      routingReason: `Retry ${retryTask.retryCount}/${retryTask.maxRetries}: ${error} | Priority boosted: ${priorityScore.boosts.map(b => b.reason).join(', ')}`,
    };

    await this.taskRepository.update(retryTask);
    await this.taskQueue.enqueue(retryTask.id, Number(retryTask.priority));

    return retryTask;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) return false;

    if (task.status === AITaskStatus.PROCESSING) {
      return false;
    }

    const updatedTask: AITask = {
      ...task,
      status: AITaskStatus.CANCELLED,
      completedAt: new Date(),
    };

    await this.taskRepository.update(updatedTask);
    await this.taskQueue.remove(taskId);

    return true;
  }

  async getNextTask(): Promise<string | null> {
    return this.taskQueue.dequeue();
  }

  async getTaskPosition(taskId: string): Promise<number> {
    return this.taskQueue.getPosition(taskId);
  }

  async getQueueLength(): Promise<number> {
    return this.taskQueue.getQueueLength();
  }

  async getUserTaskSummary(userId: string): Promise<AITaskSummary> {
    return this.taskRepository.getSummary(userId);
  }

  private generateTaskId(): string {
    return `task_${crypto.randomUUID()}`;
  }

  setTaskTimeout(taskId: string, timeoutMs: number): void {
    const timeout = setTimeout(async () => {
      await this.failTask(taskId, `Task timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    this.processingTasks.set(taskId, timeout);
  }

  clearTaskTimeout(taskId: string): void {
    const timeout = this.processingTasks.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.processingTasks.delete(taskId);
    }
  }

  updateConfig(config: Partial<AITaskManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AITaskManagerConfig {
    return { ...this.config };
  }
}
