import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { BrowserManager } from './BrowserManager';
import {
  AIBrowserService,
  SimpleAIAnalyzer,
  AIAnalyzer,
} from './AIBrowserService';
import {
  BrowserAIAction,
  BrowserAIContext,
  BrowserAIResult,
  ApprovalRequest,
  ApprovalStatus,
} from './AIBrowserTypes';

export interface BrowserAITask {
  id: string;
  userId: string;
  task: string;
  status: BrowserAITaskStatus;
  steps: BrowserAITaskStep[];
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export enum BrowserAITaskStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  AWAITING_APPROVAL = 'awaiting_approval',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface BrowserAITaskStep {
  id: string;
  action: BrowserAIAction;
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'failed';
  result?: Record<string, any>;
  error?: string;
}

export class BrowserAIOrchestrator extends EventEmitter {
  private browserManager: BrowserManager;
  private aiService: AIBrowserService;
  private tasks: Map<string, BrowserAITask> = new Map();
  private sessionId: string | null = null;
  private tabId: string | null = null;

  constructor(browserManager: BrowserManager, analyzer?: AIAnalyzer) {
    super();
    this.browserManager = browserManager;
    this.aiService = new AIBrowserService(analyzer || new SimpleAIAnalyzer());

    this.aiService.on('approval:granted', (request: ApprovalRequest) => {
      this.emit('approval:granted', request);
    });

    this.aiService.on('approval:denied', (request: ApprovalRequest) => {
      this.emit('approval:denied', request);
    });
  }

  async initialize(): Promise<void> {
    this.sessionId = await this.browserManager.createSession({
      type: 'ai_browser',
    });
    const tab = await this.browserManager.createTab(this.sessionId);
    this.tabId = tab.id;
  }

  async executeTask(
    task: string,
    context: BrowserAIContext
  ): Promise<BrowserAIResult> {
    const taskId = uuidv4();
    const browserTask: BrowserAITask = {
      id: taskId,
      userId: context.userId,
      task,
      status: BrowserAITaskStatus.ANALYZING,
      steps: [],
      createdAt: new Date(),
    };
    this.tasks.set(taskId, browserTask);

    try {
      if (!this.sessionId || !this.tabId) {
        await this.initialize();
      }

      const content = await this.readCurrentPage();
      const suggestion = await this.aiService.analyzeAndSuggestActions(
        content,
        task,
        context
      );

      browserTask.steps = suggestion.actions.map((action) => ({
        id: action.id,
        action,
        status: action.requiresApproval ? 'pending' : 'approved',
      }));

      const approvalRequired = suggestion.actions.some(
        (a) => a.requiresApproval
      );

      if (approvalRequired) {
        browserTask.status = BrowserAITaskStatus.AWAITING_APPROVAL;

        const request = await this.aiService.requestApproval(
          taskId,
          context.userId,
          suggestion.actions,
          suggestion.summary
        );

        return {
          success: true,
          actions: suggestion.actions,
          approvalRequest: request,
        };
      }

      browserTask.status = BrowserAITaskStatus.EXECUTING;
      const results = await this.executeApprovedActions(browserTask);

      browserTask.status = BrowserAITaskStatus.COMPLETED;
      browserTask.completedAt = new Date();

      return {
        success: true,
        actions: suggestion.actions,
      };
    } catch (error) {
      browserTask.status = BrowserAITaskStatus.FAILED;
      browserTask.error =
        error instanceof Error ? error.message : String(error);
      browserTask.completedAt = new Date();

      return {
        success: false,
        error: browserTask.error,
      };
    }
  }

  async approveTask(
    taskId: string,
    approved: boolean
  ): Promise<BrowserAIResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const request = this.aiService.getPendingApproval(taskId);
    if (!request) {
      return { success: false, error: 'No pending approval' };
    }

    await this.aiService.respondToApproval(taskId, approved);

    if (!approved) {
      task.status = BrowserAITaskStatus.FAILED;
      task.error = 'User denied approval';
      task.completedAt = new Date();
      return { success: false, error: 'User denied approval' };
    }

    task.status = BrowserAITaskStatus.EXECUTING;
    const results = await this.executeApprovedActions(task);

    task.status = BrowserAITaskStatus.COMPLETED;
    task.completedAt = new Date();

    return { success: true, actions: task.steps.map((s) => s.action) };
  }

  private async executeApprovedActions(
    task: BrowserAITask
  ): Promise<Record<string, any>[]> {
    const results: Record<string, any>[] = [];

    for (const step of task.steps) {
      if (step.status === 'denied' || step.status === 'failed') {
        continue;
      }

      try {
        const result = await this.browserManager.executeAction(this.tabId!, {
          type: step.action.type as any,
          selector: step.action.selector,
          value: step.action.value,
          options: step.action.options,
        });

        step.status = result.success ? 'executed' : 'failed';
        step.result = result;
        results.push(result);
      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        results.push({ success: false, error: step.error });
      }
    }

    return results;
  }

  private async readCurrentPage(): Promise<any> {
    return {
      url: 'about:blank',
      title: 'New Tab',
      content: 'No content yet',
      html: '',
    };
  }

  async navigate(url: string): Promise<BrowserAIResult> {
    if (!this.tabId) {
      return { success: false, error: 'No active tab' };
    }

    try {
      await this.browserManager.navigate(this.tabId, url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getTask(taskId: string): BrowserAITask | undefined {
    return this.tasks.get(taskId);
  }

  getTasksByUser(userId: string): BrowserAITask[] {
    return Array.from(this.tasks.values()).filter((t) => t.userId === userId);
  }

  addApprovalCallback(
    callback: (request: ApprovalRequest) => Promise<boolean>
  ): void {
    this.aiService.addApprovalCallback(callback);
  }

  async shutdown(): Promise<void> {
    if (this.tabId) {
      await this.browserManager.closeTab(this.tabId);
    }
    await this.browserManager.shutdown();
  }
}
