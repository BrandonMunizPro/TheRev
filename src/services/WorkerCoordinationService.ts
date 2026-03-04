import { EntityManager, Repository } from 'typeorm';
import { Worker, WorkerStatus } from '../entities/Task';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

export interface WorkerHeartbeat {
  workerId: string;
  cpuUsage: number;
  memoryUsage: number;
  currentTaskId?: string;
  currentQueue?: string;
}

export interface WorkerRegistration {
  workerId: string;
  capabilities?: string[];
  maxConcurrentTasks?: number;
}

const HEARTBEAT_TIMEOUT_MS = 30000;
const STALE_WORKER_THRESHOLD_MS = 60000;

export class WorkerCoordinationService extends EventEmitter {
  private workerRepo: Repository<Worker>;
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private localWorkerId: string;
  private isLeader = false;

  constructor(
    private em: EntityManager,
    private redis: any
  ) {
    super();
    this.workerRepo = em.getRepository(Worker);
    this.localWorkerId = `worker-${uuidv4()}`;
  }

  getWorkerId(): string {
    return this.localWorkerId;
  }

  async registerWorker(registration: WorkerRegistration): Promise<Worker> {
    const existing = await this.workerRepo.findOne({
      where: { workerId: registration.workerId },
    });

    if (existing) {
      existing.status = WorkerStatus.IDLE;
      existing.lastHeartbeatAt = new Date();
      return this.workerRepo.save(existing);
    }

    const worker = this.workerRepo.create({
      workerId: registration.workerId,
      status: WorkerStatus.IDLE,
      maxConcurrentTasks: registration.maxConcurrentTasks || 1,
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
    });

    const saved = await this.workerRepo.save(worker);
    this.emit('worker:registered', saved);

    await this.redis?.sadd('workers:available', registration.workerId);

    return saved;
  }

  async unregisterWorker(workerId: string): Promise<void> {
    await this.workerRepo.delete({ workerId });
    this.emit('worker:unregistered', workerId);
    await this.redis?.srem('workers:available', workerId);
  }

  async heartbeat(data: WorkerHeartbeat): Promise<void> {
    const worker = await this.workerRepo.findOne({
      where: { workerId: data.workerId },
    });

    if (!worker) {
      return;
    }

    worker.lastHeartbeatAt = new Date();
    worker.cpuUsage = data.cpuUsage;
    worker.memoryUsage = data.memoryUsage;
    worker.currentTaskId = data.currentTaskId;
    worker.currentQueue = data.currentQueue;
    worker.status = data.currentTaskId ? WorkerStatus.BUSY : WorkerStatus.IDLE;

    await this.workerRepo.save(worker);

    await this.redis?.set(
      `worker:heartbeat:${data.workerId}`,
      Date.now(),
      'EX',
      30
    );
  }

  async getAvailableWorkers(): Promise<Worker[]> {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    return this.workerRepo
      .createQueryBuilder('worker')
      .where('worker.status = :status', { status: WorkerStatus.IDLE })
      .andWhere('worker.lastHeartbeatAt > :cutoff', { cutoff })
      .orderBy('worker.averageProcessingTimeMs', 'ASC')
      .getMany();
  }

  async getWorkerById(workerId: string): Promise<Worker | null> {
    return this.workerRepo.findOne({ where: { workerId } });
  }

  async getAllWorkers(): Promise<Worker[]> {
    return this.workerRepo.find({
      order: { lastHeartbeatAt: 'DESC' },
    });
  }

  async getActiveWorkers(): Promise<Worker[]> {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    return this.workerRepo
      .createQueryBuilder('worker')
      .where('worker.lastHeartbeatAt > :cutoff', { cutoff })
      .getMany();
  }

  async cleanupStaleWorkers(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_WORKER_THRESHOLD_MS);
    const staleWorkers = await this.workerRepo
      .createQueryBuilder('worker')
      .where('worker.lastHeartbeatAt < :cutoff', { cutoff })
      .andWhere('worker.status != :offline', { offline: WorkerStatus.OFFLINE })
      .getMany();

    for (const worker of staleWorkers) {
      worker.status = WorkerStatus.OFFLINE;
      await this.workerRepo.save(worker);
      this.emit('worker:stale', worker);
      await this.redis?.srem('workers:available', worker.workerId);
    }

    return staleWorkers.length;
  }

  async acquireLock(
    resource: string,
    workerId: string,
    ttlMs: number = 10000
  ): Promise<boolean> {
    if (!this.redis) return true;

    const result = await this.redis.set(
      `lock:${resource}`,
      workerId,
      'NX',
      'PX',
      ttlMs
    );
    return result === 'OK';
  }

  async releaseLock(resource: string, workerId: string): Promise<void> {
    if (!this.redis) return;

    const currentHolder = await this.redis.get(`lock:${resource}`);
    if (currentHolder === workerId) {
      await this.redis.del(`lock:${resource}`);
    }
  }

  async electLeader(): Promise<string> {
    const electionKey = 'leader:election';
    const lockResult = await this.acquireLock(
      electionKey,
      this.localWorkerId,
      5000
    );

    if (!lockResult) {
      const currentLeader = await this.redis?.get('leader:current');
      return currentLeader || '';
    }

    const leaderKey = 'leader:current';
    await this.redis?.set(leaderKey, this.localWorkerId, 'XX');

    const currentLeader = await this.redis?.get(leaderKey);
    if (currentLeader === this.localWorkerId) {
      this.isLeader = true;
      this.emit('leader:elected', this.localWorkerId);
    }

    await this.releaseLock(electionKey, this.localWorkerId);
    return currentLeader || '';
  }

  async getCurrentLeader(): Promise<string | undefined> {
    const leader = await this.redis?.get('leader:current');
    return leader || undefined;
  }

  startHeartbeatMonitor(): void {
    this.heartbeatCheckInterval = setInterval(async () => {
      try {
        await this.cleanupStaleWorkers();
      } catch (error) {
        console.error('Heartbeat monitor error:', error);
      }
    }, HEARTBEAT_TIMEOUT_MS / 2);
  }

  stopHeartbeatMonitor(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }

  async updateWorkerStats(
    workerId: string,
    stats: {
      tasksProcessed?: number;
      tasksFailed?: number;
      averageProcessingTimeMs?: number;
    }
  ): Promise<void> {
    const worker = await this.workerRepo.findOne({
      where: { workerId },
    });

    if (!worker) return;

    if (stats.tasksProcessed !== undefined) {
      worker.tasksProcessed += stats.tasksProcessed;
    }
    if (stats.tasksFailed !== undefined) {
      worker.tasksFailed += stats.tasksFailed;
    }
    if (stats.averageProcessingTimeMs !== undefined) {
      const currentAvg = worker.averageProcessingTimeMs || 0;
      const totalProcessed = worker.tasksProcessed || 1;
      worker.averageProcessingTimeMs =
        (currentAvg * (totalProcessed - 1) + stats.averageProcessingTimeMs) /
        totalProcessed;
    }

    await this.workerRepo.save(worker);
  }

  async shutdown(): Promise<void> {
    this.stopHeartbeatMonitor();
    await this.unregisterWorker(this.localWorkerId);
  }
}
