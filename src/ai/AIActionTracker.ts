import { EventEmitter } from 'events';
import {
  AIActionType,
  AIActionStatus,
  AIAction,
  AIActionFilter,
  ActionDiff,
  ActionVersion,
  AIActionMetrics,
  RollbackPlan,
  RollbackStep,
  RollbackResult,
  ApprovalRequest,
} from './AIActionTypes';
import { AuditService } from './AuditService';
import { AuditEventType } from './AuditTypes';

export interface IAIActionRepository {
  save(action: AIAction): Promise<void>;
  saveBatch(actions: AIAction[]): Promise<void>;
  findById(id: string): Promise<AIAction | null>;
  findByFilter(filter: AIActionFilter): Promise<AIAction[]>;
  getVersions(actionId: string): Promise<ActionVersion[]>;
  saveVersion(version: ActionVersion): Promise<void>;
  updateStatus(id: string, status: AIActionStatus, metadata?: Record<string, unknown>): Promise<void>;
  getMetrics(filter?: AIActionFilter): Promise<AIActionMetrics>;
}

export class AIActionTracker extends EventEmitter {
  private repository: IAIActionRepository;
  private auditService?: AuditService;
  private maxVersionsPerAction: number = 10;
  private pendingActions: Map<string, AIAction> = new Map();

  constructor(repository: IAIActionRepository, auditService?: AuditService) {
    super();
    this.repository = repository;
    this.auditService = auditService;
  }

  async startAction(
    taskId: string,
    userId: string,
    actionType: AIActionType,
    targetType: AIAction['targetType'],
    targetId: string,
    input: { previousState?: Record<string, unknown>; newState?: Record<string, unknown> },
    options: {
      provider: string;
      model?: string;
      metadata?: Record<string, unknown>;
      canRollback?: boolean;
      requiresApproval?: boolean;
    }
  ): Promise<AIAction> {
    const action: AIAction = {
      id: this.generateId(),
      taskId,
      userId,
      actionType,
      status: AIActionStatus.IN_PROGRESS,
      timestamp: new Date(),
      targetType,
      targetId,
      previousState: input.previousState,
      newState: input.newState,
      diff: this.computeDiff(input.previousState, input.newState),
      provider: options.provider,
      model: options.model,
      metadata: options.metadata || {},
      canRollback: options.canRollback ?? true,
      requiresApproval: options.requiresApproval ?? false,
    };

    await this.repository.save(action);
    this.pendingActions.set(action.id, action);

    await this.auditService?.logTaskStarted(taskId, userId, options.provider, {
      actionId: action.id,
      actionType,
      targetType,
      targetId,
    });

    this.emit('action:started', action);
    return action;
  }

  async completeAction(
    actionId: string,
    output: {
      tokensUsed?: number;
      cost?: number;
      finishReason?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AIAction | null> {
    const action = this.pendingActions.get(actionId) || await this.repository.findById(actionId);
    if (!action) return null;

    action.status = AIActionStatus.COMPLETED;
    action.completedAt = new Date();
    action.tokensUsed = output.tokensUsed;
    action.cost = output.cost;

    if (output.metadata) {
      action.metadata = { ...action.metadata, ...output.metadata };
    }

    if (action.newState) {
      await this.saveVersion(action);
    }

    await this.repository.updateStatus(actionId, AIActionStatus.COMPLETED, {
      completedAt: action.completedAt,
      tokensUsed: action.tokensUsed,
      cost: action.cost,
    });

    this.pendingActions.delete(actionId);

    await this.auditService?.logTaskCompleted(action.taskId, action.userId, action.provider, {
      tokensUsed: output.tokensUsed,
      finishReason: output.finishReason || 'complete',
    }, { actionId, cost: output.cost });

    this.emit('action:completed', action);
    return action;
  }

  async failAction(
    actionId: string,
    error: string,
    metadata?: Record<string, unknown>
  ): Promise<AIAction | null> {
    const action = this.pendingActions.get(actionId) || await this.repository.findById(actionId);
    if (!action) return null;

    action.status = AIActionStatus.FAILED;
    action.completedAt = new Date();
    action.metadata = { ...action.metadata, error, ...metadata };

    await this.repository.updateStatus(actionId, AIActionStatus.FAILED, {
      completedAt: action.completedAt,
      error,
      ...metadata,
    });

    this.pendingActions.delete(actionId);

    await this.auditService?.logTaskFailed(action.taskId, action.userId, action.provider, error, { actionId });

    this.emit('action:failed', action);
    return action;
  }

  async cancelAction(actionId: string, reason?: string): Promise<AIAction | null> {
    const action = await this.repository.findById(actionId);
    if (!action) return null;

    if (action.status === AIActionStatus.COMPLETED || action.status === AIActionStatus.ROLLED_BACK) {
      throw new Error(`Cannot cancel action in status: ${action.status}`);
    }

    action.status = AIActionStatus.CANCELLED;
    action.completedAt = new Date();
    action.metadata = { ...action.metadata, cancelReason: reason };

    await this.repository.updateStatus(actionId, AIActionStatus.CANCELLED, {
      completedAt: action.completedAt,
      cancelReason: reason,
    });

    this.pendingActions.delete(actionId);
    this.emit('action:cancelled', action);
    return action;
  }

  private computeDiff(
    before?: Record<string, unknown>,
    after?: Record<string, unknown>
  ): ActionDiff | undefined {
    if (!before || !after) return undefined;

    const added: Record<string, unknown> = {};
    const removed: Record<string, unknown> = {};
    const modified: Record<string, { before: unknown; after: unknown }> = {};

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const beforeVal = before[key];
      const afterVal = after[key];

      if (!(key in before)) {
        added[key] = afterVal;
      } else if (!(key in after)) {
        removed[key] = beforeVal;
      } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        modified[key] = { before: beforeVal, after: afterVal };
      }
    }

    if (Object.keys(added).length === 0 && Object.keys(removed).length === 0 && Object.keys(modified).length === 0) {
      return undefined;
    }

    return { added, removed, modified };
  }

  private async saveVersion(action: AIAction): Promise<void> {
    const versions = await this.repository.getVersions(action.id);
    const versionNumber = versions.length + 1;

    if (versionNumber > this.maxVersionsPerAction) {
      const oldest = versions.sort((a, b) => a.version - b.version)[0];
      if (oldest) {
        console.log(`[AIAction] Pruning old version ${oldest.version} for action ${action.id}`);
      }
    }

    const version: ActionVersion = {
      id: this.generateId(),
      actionId: action.id,
      version: versionNumber,
      state: action.newState || {},
      timestamp: new Date(),
      changedBy: action.userId,
    };

    await this.repository.saveVersion(version);
  }

  async getAction(actionId: string): Promise<AIAction | null> {
    return this.repository.findById(actionId);
  }

  async getActionHistory(filter: AIActionFilter): Promise<AIAction[]> {
    return this.repository.findByFilter(filter);
  }

  async getActionVersions(actionId: string): Promise<ActionVersion[]> {
    return this.repository.getVersions(actionId);
  }

  async getMetrics(filter?: AIActionFilter): Promise<AIActionMetrics> {
    return this.repository.getMetrics(filter);
  }

  private generateId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export class AIRollbackService extends EventEmitter {
  private actionTracker: AIActionTracker;
  private repository: IAIActionRepository;
  private maxRollbackDepth: number = 5;

  constructor(actionTracker: AIActionTracker, repository: IAIActionRepository) {
    super();
    this.actionTracker = actionTracker;
    this.repository = repository;
  }

  async createRollbackPlan(actionId: string): Promise<RollbackPlan> {
    const action = await this.actionTracker.getAction(actionId);
    if (!action) {
      return {
        actionId,
        steps: [],
        estimatedImpact: 0,
        dependencies: [],
        canExecute: false,
        reasons: ['Action not found'],
      };
    }

    if (!action.canRollback) {
      return {
        actionId,
        steps: [],
        estimatedImpact: 0,
        dependencies: [],
        canExecute: false,
        reasons: ['Action does not support rollback'],
      };
    }

    if (action.status !== AIActionStatus.COMPLETED) {
      return {
        actionId,
        steps: [],
        estimatedImpact: 0,
        dependencies: [],
        canExecute: false,
        reasons: [`Action status is ${action.status}, not COMPLETED`],
      };
    }

    const relatedActions = await this.findRelatedActions(action);
    const steps = this.buildRollbackSteps(action, relatedActions);
    const dependencies = this.findDependencies(steps);

    return {
      actionId,
      steps,
      estimatedImpact: relatedActions.length + 1,
      dependencies,
      canExecute: steps.length <= this.maxRollbackDepth,
      reasons: steps.length <= this.maxRollbackDepth ? [] : ['Rollback depth exceeds maximum'],
    };
  }

  private async findRelatedActions(action: AIAction): Promise<AIAction[]> {
    const filter: AIActionFilter = {
      targetType: action.targetType,
      targetId: action.targetId,
      startDate: action.timestamp,
      status: AIActionStatus.COMPLETED,
    };

    const actions = await this.actionTracker.getActionHistory(filter);
    return actions.filter(a => a.id !== action.id && a.status === AIActionStatus.COMPLETED);
  }

  private buildRollbackSteps(action: AIAction, relatedActions: AIAction[]): RollbackStep[] {
    const steps: RollbackStep[] = [];

    for (const related of relatedActions.reverse()) {
      steps.push({
        order: steps.length + 1,
        actionType: related.actionType,
        targetType: related.targetType,
        targetId: related.targetId,
        previousState: related.previousState || {},
        rollbackAction: 'restore',
        status: 'pending',
      });
    }

    if (action.previousState) {
      steps.push({
        order: steps.length + 1,
        actionType: action.actionType,
        targetType: action.targetType,
        targetId: action.targetId,
        previousState: action.previousState,
        rollbackAction: 'restore',
        status: 'pending',
      });
    } else if (action.actionType === AIActionType.CONTENT_DELETE) {
      steps.push({
        order: steps.length + 1,
        actionType: action.actionType,
        targetType: action.targetType,
        targetId: action.targetId,
        previousState: {},
        rollbackAction: 'restore',
        status: 'pending',
      });
    }

    return steps;
  }

  private findDependencies(steps: RollbackStep[]): string[] {
    return [];
  }

  async executeRollback(plan: RollbackPlan, userId: string): Promise<RollbackResult> {
    const result: RollbackResult = {
      success: false,
      actionId: plan.actionId,
      rolledBackSteps: 0,
      failedSteps: 0,
      errors: [],
      completedAt: new Date(),
    };

    if (!plan.canExecute) {
      result.errors.push(...plan.reasons);
      return result;
    }

    for (const step of plan.steps) {
      try {
        await this.executeRollbackStep(step, userId);
        step.status = 'completed';
        result.rolledBackSteps++;
      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        result.failedSteps++;
        result.errors.push(`Step ${step.order} failed: ${step.error}`);
      }
    }

    const action = await this.actionTracker.getAction(plan.actionId);
    if (action && result.failedSteps === 0) {
      await this.actionTracker['repository'].updateStatus(plan.actionId, AIActionStatus.ROLLED_BACK, {
        rolledBackAt: result.completedAt,
        rolledBackBy: userId,
        rolledBackSteps: result.rolledBackSteps,
      });
      result.success = true;
    } else if (action && result.rolledBackSteps > 0) {
      await this.actionTracker['repository'].updateStatus(plan.actionId, AIActionStatus.PARTIALLY_ROLLED_BACK, {
        rolledBackAt: result.completedAt,
        rolledBackBy: userId,
        rolledBackSteps: result.rolledBackSteps,
        failedSteps: result.failedSteps,
      });
    }

    this.emit('rollback:completed', result);
    return result;
  }

  private async executeRollbackStep(step: RollbackStep, userId: string): Promise<void> {
    switch (step.rollbackAction) {
      case 'restore':
        await this.restoreState(step, userId);
        break;
      case 'delete':
        await this.deleteResource(step, userId);
        break;
      case 'notify':
        await this.notifyUser(step, userId);
        break;
    }
  }

  private async restoreState(step: RollbackStep, userId: string): Promise<void> {
    console.log(`[Rollback] Restoring ${step.targetType}:${step.targetId} to previous state`);
    this.emit('rollback:restore', { step, userId });
  }

  private async deleteResource(step: RollbackStep, userId: string): Promise<void> {
    console.log(`[Rollback] Deleting ${step.targetType}:${step.targetId}`);
    this.emit('rollback:delete', { step, userId });
  }

  private async notifyUser(step: RollbackStep, userId: string): Promise<void> {
    console.log(`[Rollback] Notifying user ${userId} about rollback of ${step.targetType}:${step.targetId}`);
    this.emit('rollback:notify', { step, userId });
  }

  async requestApproval(actionId: string, userId: string, approverRole?: string): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: this.generateId(),
      actionId,
      userId,
      requestedAt: new Date(),
      approverRole,
      status: 'pending',
    };

    this.emit('approval:requested', request);
    return request;
  }

  async approveRequest(requestId: string, reviewerId: string, reason?: string): Promise<void> {
    this.emit('approval:approved', { requestId, reviewerId, reason });
  }

  async rejectRequest(requestId: string, reviewerId: string, reason: string): Promise<void> {
    this.emit('approval:rejected', { requestId, reviewerId, reason });
  }

  private generateId(): string {
    return `rollback_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
