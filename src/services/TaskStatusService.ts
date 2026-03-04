import { EntityManager, Repository } from 'typeorm';
import { TaskEntity, TaskEvent, TaskStatus, TaskType } from '../entities/Task';
import { v4 as uuidv4 } from 'uuid';

export class TaskStatusService {
  private taskRepo: Repository<TaskEntity>;
  private eventRepo: Repository<TaskEvent>;

  constructor(private em: EntityManager) {
    this.taskRepo = em.getRepository(TaskEntity);
    this.eventRepo = em.getRepository(TaskEvent);
  }

  async createTask(
    userId: string,
    taskType: string,
    payload: any,
    priority: number = 2,
    timeout: number = 300000,
    maxRetries: number = 3
  ): Promise<TaskEntity> {
    const task = this.taskRepo.create({
      userId,
      taskType,
      payload: JSON.stringify(payload),
      status: TaskStatus.PENDING,
      priority: priority as any,
      timeout,
      maxRetries,
      requestId: uuidv4(),
    });

    const saved = await this.taskRepo.save(task);
    await this.recordEvent(saved.id, 'TASK_CREATED', { taskType, priority });

    return saved;
  }

  async updateStatus(
    taskId: string,
    status: TaskStatus,
    additionalData?: {
      workerId?: string;
      provider?: string;
      result?: any;
      errorMessage?: string;
      errorStack?: string;
    }
  ): Promise<TaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const oldStatus = task.status;
    task.status = status;

    if (status === TaskStatus.QUEUED) {
      task.scheduledAt = new Date();
    } else if (status === TaskStatus.PROCESSING) {
      task.startedAt = new Date();
      if (additionalData?.workerId) {
        task.workerId = additionalData.workerId;
      }
      if (additionalData?.provider) {
        task.provider = additionalData.provider;
      }
    } else if (status === TaskStatus.COMPLETED) {
      task.completedAt = new Date();
      if (additionalData?.result) {
        task.result = JSON.stringify(additionalData.result);
      }
    } else if (status === TaskStatus.FAILED) {
      task.completedAt = new Date();
      if (additionalData?.errorMessage) {
        task.errorMessage = additionalData.errorMessage;
      }
      if (additionalData?.errorStack) {
        task.errorStack = additionalData.errorStack;
      }
      task.retryCount += 1;
    }

    const saved = await this.taskRepo.save(task);
    await this.recordEvent(taskId, `STATUS_${status}`, {
      oldStatus,
      newStatus: status,
      ...additionalData,
    });

    return saved;
  }

  async assignToWorker(
    taskId: string,
    workerId: string,
    queueName: string
  ): Promise<TaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.workerId = workerId;
    task.status = TaskStatus.PROCESSING;
    task.startedAt = new Date();

    const saved = await this.taskRepo.save(task);
    await this.recordEvent(taskId, 'TASK_ASSIGNED', { workerId, queueName });

    return saved;
  }

  async recordEvent(
    taskId: string,
    eventType: string,
    metadata?: any
  ): Promise<TaskEvent> {
    const event = this.eventRepo.create({
      taskId,
      eventType,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });

    return this.eventRepo.save(event);
  }

  async getTaskHistory(taskId: string): Promise<TaskEvent[]> {
    return this.eventRepo.find({
      where: { taskId },
      order: { timestamp: 'ASC' },
    });
  }

  async getTasksByStatus(
    status: TaskStatus,
    limit: number = 100
  ): Promise<TaskEntity[]> {
    return this.taskRepo.find({
      where: { status },
      order: { priority: 'ASC', createdAt: 'ASC' },
      take: limit,
    });
  }

  async getTasksByUser(
    userId: string,
    limit: number = 50
  ): Promise<TaskEntity[]> {
    return this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getTaskById(taskId: string): Promise<TaskEntity | null> {
    return this.taskRepo.findOne({ where: { id: taskId } });
  }

  async cancelTask(taskId: string): Promise<TaskEntity> {
    return this.updateStatus(taskId, TaskStatus.CANCELLED);
  }

  async getQueueStats(): Promise<{
    pending: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const counts = await this.taskRepo
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany();

    const stats = {
      pending: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of counts) {
      stats[row.status.toLowerCase() as keyof typeof stats] = parseInt(
        row.count,
        10
      );
    }

    return stats;
  }
}
