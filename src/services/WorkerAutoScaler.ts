import { EventEmitter } from 'events';
import { WorkerCoordinationService } from './WorkerCoordinationService';

export interface ScalingConfig {
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
  targetQueueLengthPerWorker: number;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  currentWorkers: number;
  targetWorkers: number;
  reason: string;
  queueLength: number;
}

export interface WorkerSpawner {
  spawn(): Promise<string>;
  terminate(workerId: string): Promise<void>;
}

const DEFAULT_CONFIG: ScalingConfig = {
  minWorkers: 1,
  maxWorkers: 10,
  scaleUpThreshold: 5,
  scaleDownThreshold: 1,
  scaleUpCooldownMs: 60000,
  scaleDownCooldownMs: 300000,
  targetQueueLengthPerWorker: 10,
};

export class WorkerAutoScaler extends EventEmitter {
  private config: ScalingConfig;
  private lastScaleUpTime = 0;
  private lastScaleDownTime = 0;
  private scalingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private workerCoordination: WorkerCoordinationService,
    private taskQueueManager: any,
    config: Partial<ScalingConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getScalingDecision(queueName: string): Promise<ScalingDecision> {
    const workers = await this.workerCoordination.getActiveWorkers();
    const metrics = await this.taskQueueManager?.getQueueMetrics(queueName);

    const currentWorkers = workers.length;
    const queueLength = metrics?.waiting || 0;

    const now = Date.now();
    const timeSinceScaleUp = now - this.lastScaleUpTime;
    const timeSinceScaleDown = now - this.lastScaleDownTime;

    const scaleUpCooldownElapsed =
      timeSinceScaleUp > this.config.scaleUpCooldownMs;
    const scaleDownCooldownElapsed =
      timeSinceScaleDown > this.config.scaleDownCooldownMs;

    const targetWorkers = Math.max(
      this.config.minWorkers,
      Math.ceil(queueLength / this.config.targetQueueLengthPerWorker)
    );
    const clampedTarget = Math.min(targetWorkers, this.config.maxWorkers);

    let action: 'scale_up' | 'scale_down' | 'maintain';
    let reason: string;

    if (clampedTarget > currentWorkers && scaleUpCooldownElapsed) {
      action = 'scale_up';
      reason = `Queue length (${queueLength}) exceeds threshold (${this.config.scaleUpThreshold})`;
    } else if (
      clampedTarget < currentWorkers &&
      scaleDownCooldownElapsed &&
      queueLength === 0
    ) {
      action = 'scale_down';
      reason = `Low queue length (${queueLength}) and under threshold (${this.config.scaleDownThreshold})`;
    } else {
      action = 'maintain';
      reason = `Workers (${currentWorkers}) balanced with queue (${queueLength})`;
    }

    return {
      action,
      currentWorkers,
      targetWorkers: clampedTarget,
      reason,
      queueLength,
    };
  }

  async evaluateAndScale(queueName: string): Promise<ScalingDecision | null> {
    const decision = await this.getScalingDecision(queueName);

    if (decision.action === 'scale_up') {
      this.lastScaleUpTime = Date.now();
      this.emit('scale:up', decision);
    } else if (decision.action === 'scale_down') {
      this.lastScaleDownTime = Date.now();
      this.emit('scale:down', decision);
    }

    this.emit('decision', decision);
    return decision;
  }

  startAutoScaling(
    intervalMs: number = 30000,
    queueName: string = 'default'
  ): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`Starting auto-scaler with interval ${intervalMs}ms`);

    this.scalingInterval = setInterval(async () => {
      try {
        const decision = await this.evaluateAndScale(queueName);
        if (decision && decision.action !== 'maintain') {
          console.log(
            `Auto-scaling: ${decision.action} - ${decision.reason} (current: ${decision.currentWorkers}, target: ${decision.targetWorkers})`
          );
        }
      } catch (error) {
        console.error('Auto-scaling error:', error);
      }
    }, intervalMs);
  }

  stopAutoScaling(): void {
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
      this.scalingInterval = null;
    }
    this.isRunning = false;
    console.log('Auto-scaler stopped');
  }

  updateConfig(config: Partial<ScalingConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('Auto-scaler config updated:', this.config);
  }

  async forceScale(targetWorkers: number): Promise<void> {
    const workers = await this.workerCoordination.getActiveWorkers();
    const currentWorkers = workers.length;

    if (targetWorkers > currentWorkers) {
      const toAdd = targetWorkers - currentWorkers;
      console.log(`Force scaling up by ${toAdd} workers`);
      this.emit('force:scale_up', { targetWorkers, currentWorkers, toAdd });
    } else if (targetWorkers < currentWorkers) {
      const toRemove = currentWorkers - targetWorkers;
      console.log(`Force scaling down by ${toRemove} workers`);
      this.emit('force:scale_down', {
        targetWorkers,
        currentWorkers,
        toRemove,
      });
    }
  }

  getConfig(): ScalingConfig {
    return { ...this.config };
  }

  isAutoScalingEnabled(): boolean {
    return this.isRunning;
  }
}
