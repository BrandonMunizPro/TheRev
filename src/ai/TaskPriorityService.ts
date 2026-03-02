import {
  TaskPriority,
  TaskPriorityConfig,
  DEFAULT_PRIORITY_CONFIG,
  PriorityBoostRule,
  PriorityBoostTrigger,
  PriorityScore,
  PriorityBoost,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from './TaskPriorityTypes';

export { 
  TaskPriority, 
  TaskPriorityConfig, 
  DEFAULT_PRIORITY_CONFIG,
  PriorityBoostRule,
  PriorityBoostTrigger,
  PriorityScore,
  PriorityBoost,
} from './TaskPriorityTypes';

export { PRIORITY_LABELS, PRIORITY_COLORS } from './TaskPriorityTypes';

export interface TaskContext {
  taskId: string;
  userId: string;
  taskType: string;
  estimatedDuration: number;
  createdAt: Date;
  retryCount?: number;
  userReputation?: number;
  isViral?: boolean;
  isTimeSensitive?: boolean;
  isVipUser?: boolean;
  parentTaskId?: string;
}

export interface LoadContext {
  queueDepth: number;
  workerCount: number;
  avgWaitTimeMs: number;
  systemLoad: number;
}

export class TaskPriorityService {
  private config: TaskPriorityConfig;
  private boostRules: Map<PriorityBoostTrigger, PriorityBoostRule> = new Map();
  private maxTotalBoost: number;

  constructor(config?: Partial<TaskPriorityConfig>) {
    this.config = { ...DEFAULT_PRIORITY_CONFIG, ...config };
    this.maxTotalBoost = 5;
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    this.addBoostRule({
      trigger: PriorityBoostTrigger.USER_REPUTATION,
      boostAmount: 2,
      maxBoost: 3,
    });

    this.addBoostRule({
      trigger: PriorityBoostTrigger.VIP_USER,
      boostAmount: 3,
      maxBoost: 3,
    });

    this.addBoostRule({
      trigger: PriorityBoostTrigger.RETRY_TASK,
      boostAmount: 1,
      maxBoost: 2,
    });

    this.addBoostRule({
      trigger: PriorityBoostTrigger.TIME_SENSITIVE,
      boostAmount: 2,
      maxBoost: 4,
    });

    this.addBoostRule({
      trigger: PriorityBoostTrigger.CONTENT_VIRALITY,
      boostAmount: 1,
      maxBoost: 2,
    });
  }

  addBoostRule(rule: PriorityBoostRule): void {
    this.boostRules.set(rule.trigger, rule);
  }

  calculatePriority(
    context: TaskContext, 
    basePriority?: TaskPriority,
    loadContext?: LoadContext
  ): PriorityScore {
    const baseValue = (basePriority ?? this.config.defaultPriority) as number;
    let currentValue = baseValue;
    const boosts: PriorityBoost[] = [];

    if (this.config.enablePriorityBoost) {
      if (context.userReputation && context.userReputation >= 100) {
        const rule = this.boostRules.get(PriorityBoostTrigger.USER_REPUTATION);
        if (rule) {
          const boost = Math.min(rule.boostAmount, rule.maxBoost);
          const allowed = this.getBoostAllowance(currentValue, boosts, boost);
          currentValue += allowed;
          if (allowed > 0) {
            boosts.push({
              rule: PriorityBoostTrigger.USER_REPUTATION,
              amount: allowed,
              reason: `High reputation user (${context.userReputation})`,
            });
          }
        }
      }

      if (context.isVipUser) {
        const rule = this.boostRules.get(PriorityBoostTrigger.VIP_USER);
        if (rule) {
          const boost = Math.min(rule.boostAmount, rule.maxBoost);
          const allowed = this.getBoostAllowance(currentValue, boosts, boost);
          currentValue += allowed;
          if (allowed > 0) {
            boosts.push({
              rule: PriorityBoostTrigger.VIP_USER,
              amount: allowed,
              reason: 'VIP user',
            });
          }
        }
      }

      if (context.isTimeSensitive) {
        const rule = this.boostRules.get(PriorityBoostTrigger.TIME_SENSITIVE);
        if (rule) {
          const boost = Math.min(rule.boostAmount, rule.maxBoost);
          const allowed = this.getBoostAllowance(currentValue, boosts, boost);
          currentValue += allowed;
          if (allowed > 0) {
            boosts.push({
              rule: PriorityBoostTrigger.TIME_SENSITIVE,
              amount: allowed,
              reason: 'Time-sensitive task',
            });
          }
        }
      }

      if (context.isViral) {
        const rule = this.boostRules.get(PriorityBoostTrigger.CONTENT_VIRALITY);
        if (rule) {
          const boost = Math.min(rule.boostAmount, rule.maxBoost);
          const allowed = this.getBoostAllowance(currentValue, boosts, boost);
          currentValue += allowed;
          if (allowed > 0) {
            boosts.push({
              rule: PriorityBoostTrigger.CONTENT_VIRALITY,
              amount: allowed,
              reason: 'Viral content detected',
            });
          }
        }
      }

      if (context.retryCount && context.retryCount > 0 && context.retryCount <= 3) {
        const rule = this.boostRules.get(PriorityBoostTrigger.RETRY_TASK);
        if (rule) {
          const boost = Math.min(rule.boostAmount, rule.maxBoost);
          const allowed = this.getBoostAllowance(currentValue, boosts, boost);
          currentValue += allowed;
          if (allowed > 0) {
            boosts.push({
              rule: PriorityBoostTrigger.RETRY_TASK,
              amount: allowed,
              reason: `Retry ${context.retryCount}`,
            });
          }
        }
      }
    }

    if (this.config.enableAging && context.createdAt) {
      const ageBoost = this.calculateAgeBoost(context.createdAt);
      if (ageBoost > 0) {
        const allowed = this.getBoostAllowance(currentValue, boosts, ageBoost);
        currentValue += allowed;
        if (allowed > 0) {
          boosts.push({
            rule: PriorityBoostTrigger.TASK_AGING,
            amount: allowed,
            reason: 'Task waiting in queue',
          });
        }
      }
    }

    if (loadContext) {
      const loadAdjustment = this.calculateLoadAdjustment(loadContext, currentValue, boosts);
      currentValue += loadAdjustment;
    }

    const finalValue = Math.min(
      Math.max(currentValue, this.config.minPriority as number),
      this.config.maxPriority as number
    );

    return {
      base: basePriority ?? this.config.defaultPriority,
      boosts,
      final: finalValue as TaskPriority,
      calculatedAt: new Date(),
    };
  }

  private getBoostAllowance(
    currentValue: number, 
    existingBoosts: PriorityBoost[], 
    requestedBoost: number
  ): number {
    const totalBoost = existingBoosts.reduce((sum, b) => sum + b.amount, 0);
    const remainingCap = this.maxTotalBoost - totalBoost;
    return Math.min(requestedBoost, remainingCap);
  }

  private calculateAgeBoost(createdAt: Date): number {
    const age = Date.now() - createdAt.getTime();
    
    if (age < this.config.agingThresholdMs) {
      return 0;
    }

    const ageMinutes = Math.floor((age - this.config.agingThresholdMs) / 60000);
    const boostLevel = Math.floor(ageMinutes / 5);
    
    return Math.min(boostLevel, 3);
  }

  private calculateLoadAdjustment(
    loadContext: LoadContext, 
    currentValue: number,
    boosts: PriorityBoost[]
  ): number {
    if (loadContext.queueDepth > 10000) {
      const demotion = -1;
      boosts.push({
        rule: PriorityBoostTrigger.TASK_AGING,
        amount: demotion,
        reason: 'High queue depth - priority adjusted',
      });
      return demotion;
    }

    if (loadContext.systemLoad > 0.9) {
      const demotion = -1;
      boosts.push({
        rule: PriorityBoostTrigger.TASK_AGING,
        amount: demotion,
        reason: 'High system load - priority adjusted',
      });
      return demotion;
    }

    return 0;
  }

  getPriorityLabel(priority: TaskPriority): string {
    return PRIORITY_LABELS[priority] || 'Unknown';
  }

  getPriorityColor(priority: TaskPriority): string {
    return PRIORITY_COLORS[priority] || '#000000';
  }

  comparePriority(a: TaskPriority, b: TaskPriority): number {
    return (b as number) - (a as number);
  }

  updateConfig(config: Partial<TaskPriorityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TaskPriorityConfig {
    return { ...this.config };
  }

  setMaxTotalBoost(max: number): void {
    this.maxTotalBoost = max;
  }
}
