import { EntityManager, Repository } from 'typeorm';
import { TaskMetrics, TaskEntity, Worker, TaskStatus } from '../entities/Task';
import { EventEmitter } from 'events';

export interface QueuePerformanceMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  averageProcessingTimeMs: number;
  throughput: number;
  throughputPerMinute: number;
}

export interface WorkerPerformanceMetrics {
  workerId: string;
  tasksProcessed: number;
  tasksFailed: number;
  successRate: number;
  averageProcessingTimeMs: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  queues: QueuePerformanceMetrics[];
  workers: WorkerPerformanceMetrics[];
  totalTasksPending: number;
  totalTasksActive: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageQueueTime: number;
  averageProcessingTime: number;
}

const COLLECTION_INTERVAL_MS = 60000;
const METRICS_RETENTION_DAYS = 7;

export class TaskAnalyticsService extends EventEmitter {
  private metricsRepo: Repository<TaskMetrics>;
  private taskRepo: Repository<TaskEntity>;
  private workerRepo: Repository<Worker>;
  private collectionInterval: NodeJS.Timeout | null = null;
  private metricsCache: Map<string, QueuePerformanceMetrics> = new Map();

  constructor(private em: EntityManager) {
    super();
    this.metricsRepo = em.getRepository(TaskMetrics);
    this.taskRepo = em.getRepository(TaskEntity);
    this.workerRepo = em.getRepository(Worker);
  }

  async collectMetrics(queueName: string): Promise<QueuePerformanceMetrics> {
    const pending = await this.taskRepo.count({
      where: { status: TaskStatus.PENDING },
    });
    const queued = await this.taskRepo.count({
      where: { status: TaskStatus.QUEUED },
    });
    const processing = await this.taskRepo.count({
      where: { status: TaskStatus.PROCESSING },
    });
    const completed = await this.taskRepo.count({
      where: { status: TaskStatus.COMPLETED },
    });
    const failed = await this.taskRepo.count({
      where: { status: TaskStatus.FAILED },
    });

    const avgProcessingTime = await this.taskRepo
      .createQueryBuilder('task')
      .select(
        'AVG(EXTRACT(EPOCH FROM (task.completedAt - task.startedAt)) * 1000)',
        'avg'
      )
      .where('task.status = :status', { status: TaskStatus.COMPLETED })
      .andWhere('task.startedAt IS NOT NULL')
      .andWhere('task.completedAt IS NOT NULL')
      .getRawOne();

    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentCompleted = await this.taskRepo
      .createQueryBuilder('task')
      .where('task.status = :status', { status: TaskStatus.COMPLETED })
      .andWhere('task.completedAt > :since', { since: oneMinuteAgo })
      .getCount();

    const metrics: QueuePerformanceMetrics = {
      queueName,
      waiting: pending + queued,
      active: processing,
      completed,
      failed,
      averageProcessingTimeMs: parseFloat(avgProcessingTime?.avg || '0'),
      throughput: recentCompleted,
      throughputPerMinute: recentCompleted,
    };

    this.metricsCache.set(queueName, metrics);

    const metricsEntity = this.metricsRepo.create({
      queueName,
      waitingCount: metrics.waiting,
      activeCount: metrics.active,
      completedCount: metrics.completed,
      failedCount: metrics.failed,
      averageProcessingTimeMs: metrics.averageProcessingTimeMs,
      throughput: metrics.throughput,
    });

    await this.metricsRepo.save(metricsEntity);

    return metrics;
  }

  async getWorkerMetrics(
    workerId: string
  ): Promise<WorkerPerformanceMetrics | null> {
    const worker = await this.workerRepo.findOne({ where: { workerId } });
    if (!worker) return null;

    const totalTasks = worker.tasksProcessed + worker.tasksFailed;
    const successRate =
      totalTasks > 0 ? (worker.tasksProcessed / totalTasks) * 100 : 0;

    return {
      workerId: worker.workerId,
      tasksProcessed: worker.tasksProcessed,
      tasksFailed: worker.tasksFailed,
      successRate,
      averageProcessingTimeMs: worker.averageProcessingTimeMs,
      cpuUsage: worker.cpuUsage,
      memoryUsage: worker.memoryUsage,
    };
  }

  async getAllWorkerMetrics(): Promise<WorkerPerformanceMetrics[]> {
    const workers = await this.workerRepo.find();
    return workers.map((worker) => {
      const totalTasks = worker.tasksProcessed + worker.tasksFailed;
      const successRate =
        totalTasks > 0 ? (worker.tasksProcessed / totalTasks) * 100 : 0;

      return {
        workerId: worker.workerId,
        tasksProcessed: worker.tasksProcessed,
        tasksFailed: worker.tasksFailed,
        successRate,
        averageProcessingTimeMs: worker.averageProcessingTimeMs,
        cpuUsage: worker.cpuUsage,
        memoryUsage: worker.memoryUsage,
      };
    });
  }

  async getSystemHealth(): Promise<SystemHealthStatus> {
    const queues: QueuePerformanceMetrics[] = [];
    const cachedQueue = this.metricsCache.get('default');
    if (cachedQueue) {
      queues.push(cachedQueue);
    } else {
      queues.push(await this.collectMetrics('default'));
    }

    const workers = await this.getAllWorkerMetrics();

    const totalPending = queues.reduce((sum, q) => sum + q.waiting, 0);
    const totalActive = queues.reduce((sum, q) => sum + q.active, 0);
    const totalCompleted = queues.reduce((sum, q) => sum + q.completed, 0);
    const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);

    const avgQueueTime = await this.taskRepo
      .createQueryBuilder('task')
      .select(
        'AVG(EXTRACT(EPOCH FROM (task.startedAt - task.createdAt)) * 1000)',
        'avg'
      )
      .where('task.startedAt IS NOT NULL')
      .andWhere('task.createdAt IS NOT NULL')
      .getRawOne();

    const avgProcessingTime = await this.taskRepo
      .createQueryBuilder('task')
      .select(
        'AVG(EXTRACT(EPOCH FROM (task.completedAt - task.startedAt)) * 1000)',
        'avg'
      )
      .where('task.status = :status', { status: TaskStatus.COMPLETED })
      .andWhere('task.startedAt IS NOT NULL')
      .andWhere('task.completedAt IS NOT NULL')
      .getRawOne();

    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (totalFailed > totalCompleted * 0.1 || totalActive > 100) {
      overall = 'critical';
    } else if (totalFailed > totalCompleted * 0.05 || totalPending > 50) {
      overall = 'degraded';
    }

    return {
      overall,
      queues,
      workers,
      totalTasksPending: totalPending,
      totalTasksActive: totalActive,
      totalTasksCompleted: totalCompleted,
      totalTasksFailed: totalFailed,
      averageQueueTime: parseFloat(avgQueueTime?.avg || '0'),
      averageProcessingTime: parseFloat(avgProcessingTime?.avg || '0'),
    };
  }

  async getHistoricalMetrics(
    queueName: string,
    hours: number = 24
  ): Promise<TaskMetrics[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsRepo
      .createQueryBuilder('metrics')
      .where('metrics.queueName = :queueName', { queueName })
      .andWhere('metrics.recordedAt > :since', { since })
      .orderBy('metrics.recordedAt', 'ASC')
      .getMany();
  }

  async cleanupOldMetrics(): Promise<number> {
    const cutoff = new Date(
      Date.now() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const result = await this.metricsRepo
      .createQueryBuilder()
      .delete()
      .where('recordedAt < :cutoff', { cutoff })
      .execute();

    return result.affected || 0;
  }

  startCollection(intervalMs: number = COLLECTION_INTERVAL_MS): void {
    if (this.collectionInterval) return;

    console.log(`Starting metrics collection every ${intervalMs}ms`);
    this.collectionInterval = setInterval(async () => {
      try {
        await this.collectMetrics('default');
        this.emit('metrics:collected');
      } catch (error) {
        console.error('Metrics collection error:', error);
        this.emit('error', error);
      }
    }, intervalMs);
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      console.log('Metrics collection stopped');
    }
  }

  getCachedMetrics(queueName: string): QueuePerformanceMetrics | undefined {
    return this.metricsCache.get(queueName);
  }
}
