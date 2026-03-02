export enum TaskPriority {
  CRITICAL = 10,
  HIGH = 8,
  URGENT = 7,
  NORMAL = 5,
  LOW = 3,
  BACKGROUND = 1,
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.CRITICAL]: 'Critical',
  [TaskPriority.HIGH]: 'High',
  [TaskPriority.URGENT]: 'Urgent',
  [TaskPriority.NORMAL]: 'Normal',
  [TaskPriority.LOW]: 'Low',
  [TaskPriority.BACKGROUND]: 'Background',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  [TaskPriority.CRITICAL]: '#ff0000',
  [TaskPriority.HIGH]: '#ff6600',
  [TaskPriority.URGENT]: '#ff9900',
  [TaskPriority.NORMAL]: '#00cc00',
  [TaskPriority.LOW]: '#666666',
  [TaskPriority.BACKGROUND]: '#999999',
};

export interface TaskPriorityConfig {
  defaultPriority: TaskPriority;
  minPriority: TaskPriority;
  maxPriority: TaskPriority;
  enablePriorityBoost: boolean;
  enableAging: boolean;
  agingThresholdMs: number;
  agingMultiplier: number;
}

export const DEFAULT_PRIORITY_CONFIG: TaskPriorityConfig = {
  defaultPriority: TaskPriority.NORMAL,
  minPriority: TaskPriority.BACKGROUND,
  maxPriority: TaskPriority.CRITICAL,
  enablePriorityBoost: true,
  enableAging: true,
  agingThresholdMs: 300000,
  agingMultiplier: 1.5,
};

export interface PriorityBoostRule {
  trigger: PriorityBoostTrigger;
  boostAmount: number;
  maxBoost: number;
}

export enum PriorityBoostTrigger {
  USER_REPUTATION = 'user_reputation',
  CONTENT_VIRALITY = 'content_virality',
  TIME_SENSITIVE = 'time_sensitive',
  VIP_USER = 'vip_user',
  RETRY_TASK = 'retry_task',
  TASK_AGING = 'task_aging',
}

export interface PriorityScore {
  base: number;
  boosts: PriorityBoost[];
  final: number;
  calculatedAt: Date;
}

export interface PriorityBoost {
  rule: PriorityBoostTrigger;
  amount: number;
  reason: string;
}
