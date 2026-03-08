export enum AIActionType {
  CONTENT_GENERATION = 'content_generation',
  CONTENT_EDIT = 'content_edit',
  CONTENT_DELETE = 'content_delete',
  AVATAR_UPDATE = 'avatar_update',
  PROFILE_UPDATE = 'profile_update',
  BROWSER_AUTOMATION = 'browser_automation',
  DATA_EXPORT = 'data_export',
  BULK_OPERATION = 'bulk_operation',
}

export enum AIActionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  PARTIALLY_ROLLED_BACK = 'partially_rolled_back',
  CANCELLED = 'cancelled',
}

export interface AIAction {
  id: string;
  taskId: string;
  userId: string;
  actionType: AIActionType;
  status: AIActionStatus;
  timestamp: Date;
  completedAt?: Date;
  targetType: 'post' | 'thread' | 'avatar' | 'profile' | 'browser' | 'data';
  targetId: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  diff?: ActionDiff;
  provider: string;
  model?: string;
  tokensUsed?: number;
  cost?: number;
  metadata: Record<string, unknown>;
  canRollback: boolean;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  rollbackTo?: string;
  relatedActions?: string[];
}

export interface ActionDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  modified: Record<string, { before: unknown; after: unknown }>;
}

export interface AIActionFilter {
  userId?: string;
  taskId?: string;
  actionType?: AIActionType | AIActionType[];
  status?: AIActionStatus | AIActionStatus[];
  targetType?: string;
  targetId?: string;
  canRollback?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface RollbackPlan {
  actionId: string;
  steps: RollbackStep[];
  estimatedImpact: number;
  dependencies: string[];
  canExecute: boolean;
  reasons: string[];
}

export interface RollbackStep {
  order: number;
  actionType: AIActionType;
  targetType: string;
  targetId: string;
  previousState: Record<string, unknown>;
  rollbackAction: 'restore' | 'delete' | 'notify';
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  actionId: string;
  rolledBackSteps: number;
  failedSteps: number;
  errors: string[];
  completedAt: Date;
}

export interface ActionVersion {
  id: string;
  actionId: string;
  version: number;
  state: Record<string, unknown>;
  timestamp: Date;
  changedBy: string;
  changeReason?: string;
}

export interface AIActionMetrics {
  totalActions: number;
  byType: Record<AIActionType, number>;
  byStatus: Record<AIActionStatus, number>;
  byProvider: Record<string, number>;
  rollbackRate: number;
  avgRollbackTime: number;
  totalCost: number;
}

export interface ApprovalRequest {
  id: string;
  actionId: string;
  userId: string;
  requestedAt: Date;
  approverRole?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  reason?: string;
}
