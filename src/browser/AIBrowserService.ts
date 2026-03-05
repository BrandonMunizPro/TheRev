import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  BrowserAIAction,
  BrowserAIActionType,
  RiskLevel,
  AIActionSuggestion,
  ApprovalRequest,
  ApprovalStatus,
  BrowserAIContext,
  BrowserAIResult,
  PageContent,
  PageElement,
} from './AIBrowserTypes';

export interface AIAnalyzer {
  analyzePage(content: PageContent, task: string): Promise<AIActionSuggestion>;
  extractElements(html: string): Promise<PageElement[]>;
  estimateActionRisk(action: BrowserAIAction): RiskLevel;
}

export interface ApprovalCallback {
  (request: ApprovalRequest): Promise<boolean>;
}

const RISKY_ACTIONS = [
  BrowserAIActionType.SUBMIT,
  BrowserAIActionType.TYPE,
  BrowserAIActionType.CLICK,
];

const SAFE_ACTIONS = [
  BrowserAIActionType.NAVIGATE,
  BrowserAIActionType.SCREENSHOT,
  BrowserAIActionType.EXTRACT,
  BrowserAIActionType.SCROLL,
  BrowserAIActionType.WAIT,
];

export class AIBrowserService extends EventEmitter {
  private analyzer: AIAnalyzer;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalCallbacks: ApprovalCallback[] = [];
  private approvalTimeoutMs = 60000;
  private maxRetries = 3;

  constructor(analyzer: AIAnalyzer) {
    super();
    this.analyzer = analyzer;
    this.startApprovalExpiryCheck();
  }

  async readPageContent(
    pageFn: () => Promise<{
      url: string;
      title: string;
      content: string;
      html: string;
    }>
  ): Promise<PageContent> {
    const page = await pageFn();
    return {
      url: page.url,
      title: page.title,
      text: page.content,
      html: page.html,
      visible: true,
    };
  }

  async analyzeAndSuggestActions(
    content: PageContent,
    task: string,
    context: BrowserAIContext
  ): Promise<AIActionSuggestion> {
    const suggestion = await this.analyzer.analyzePage(content, task);

    for (const action of suggestion.actions) {
      action.riskLevel = this.analyzer.estimateActionRisk(action);
      action.requiresApproval = this.doesRequireApproval(action);
    }

    suggestion.userConfirmRequired = suggestion.actions.some(
      (a) => a.requiresApproval
    );

    return suggestion;
  }

  private doesRequireApproval(action: BrowserAIAction): boolean {
    if (
      action.riskLevel === RiskLevel.HIGH ||
      action.riskLevel === RiskLevel.CRITICAL
    ) {
      return true;
    }
    if (action.riskLevel === RiskLevel.MEDIUM) {
      return true;
    }
    if (RISKY_ACTIONS.includes(action.type)) {
      return true;
    }
    return false;
  }

  async requestApproval(
    taskId: string,
    userId: string,
    actions: BrowserAIAction[],
    context: string
  ): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: uuidv4(),
      taskId,
      userId,
      actions,
      context,
      status: ApprovalStatus.PENDING,
      createdAt: new Date(),
    };

    this.pendingApprovals.set(request.id, request);

    for (const callback of this.approvalCallbacks) {
      try {
        const approved = await callback(request);
        if (approved) {
          request.status = ApprovalStatus.APPROVED;
          request.respondedAt = new Date();
          this.emit('approval:granted', request);
          break;
        }
      } catch (error) {
        console.error('Approval callback error:', error);
      }
    }

    return request;
  }

  addApprovalCallback(callback: ApprovalCallback): void {
    this.approvalCallbacks.push(callback);
  }

  removeApprovalCallback(callback: ApprovalCallback): void {
    const index = this.approvalCallbacks.indexOf(callback);
    if (index > -1) {
      this.approvalCallbacks.splice(index, 1);
    }
  }

  async respondToApproval(
    requestId: string,
    approved: boolean
  ): Promise<ApprovalRequest | null> {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      return null;
    }

    request.status = approved ? ApprovalStatus.APPROVED : ApprovalStatus.DENIED;
    request.respondedAt = new Date();

    this.emit(approved ? 'approval:granted' : 'approval:denied', request);

    if (approved) {
      this.pendingApprovals.delete(requestId);
    }

    return request;
  }

  getPendingApproval(requestId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(requestId);
  }

  getPendingApprovalsForUser(userId: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (r) => r.userId === userId && r.status === ApprovalStatus.PENDING
    );
  }

  private startApprovalExpiryCheck(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, request] of this.pendingApprovals) {
        const age = now - request.createdAt.getTime();
        if (age > this.approvalTimeoutMs) {
          request.status = ApprovalStatus.EXPIRED;
          request.respondedAt = new Date();
          this.pendingApprovals.delete(id);
          this.emit('approval:expired', request);
        }
      }
    }, 10000);
  }

  createAction(
    type: BrowserAIActionType,
    options: {
      selector?: string;
      value?: string;
      reason: string;
      riskLevel?: RiskLevel;
    }
  ): BrowserAIAction {
    return {
      id: uuidv4(),
      type,
      selector: options.selector,
      value: options.value,
      reason: options.reason,
      riskLevel: options.riskLevel || RiskLevel.LOW,
      requiresApproval: this.doesRequireApproval({
        id: '',
        type,
        riskLevel: options.riskLevel || RiskLevel.LOW,
        reason: options.reason,
      } as BrowserAIAction),
    };
  }
}

export class SimpleAIAnalyzer implements AIAnalyzer {
  async analyzePage(
    content: PageContent,
    task: string
  ): Promise<AIActionSuggestion> {
    const lowerTask = task.toLowerCase();
    const actions: BrowserAIAction[] = [];

    if (
      lowerTask.includes('go to') ||
      lowerTask.includes('navigate') ||
      lowerTask.includes('open')
    ) {
      const urlMatch = task.match(
        /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-z]+\.[a-z]{2,}[^\s]*)/i
      );
      if (urlMatch) {
        const url = urlMatch[0].startsWith('http')
          ? urlMatch[0]
          : `https://${urlMatch[0]}`;
        actions.push({
          id: uuidv4(),
          type: BrowserAIActionType.NAVIGATE,
          value: url,
          reason: `Navigate to ${url} as requested`,
          riskLevel: RiskLevel.SAFE,
          requiresApproval: false,
        });
      }
    }

    if (
      lowerTask.includes('click') ||
      lowerTask.includes('press') ||
      lowerTask.includes('button')
    ) {
      const selectorMatch = task.match(
        /button\s+(.+?)(?:\s+or|\s+then|$)|'(.+?)'/i
      );
      actions.push({
        id: uuidv4(),
        type: BrowserAIActionType.CLICK,
        selector: selectorMatch
          ? selectorMatch[1] || selectorMatch[2]
          : 'button',
        reason: `Click element as requested`,
        riskLevel: RiskLevel.MEDIUM,
        requiresApproval: true,
      });
    }

    if (
      lowerTask.includes('type') ||
      lowerTask.includes('fill') ||
      lowerTask.includes('enter')
    ) {
      const valueMatch = task.match(
        /type\s+['"](.+?)['"]|fill\s+['"](.+?)['"]/i
      );
      actions.push({
        id: uuidv4(),
        type: BrowserAIActionType.TYPE,
        selector: 'input, textarea',
        value: valueMatch ? valueMatch[1] || valueMatch[2] : '',
        reason: `Type content as requested`,
        riskLevel: RiskLevel.HIGH,
        requiresApproval: true,
      });
    }

    if (lowerTask.includes('screenshot') || lowerTask.includes('capture')) {
      actions.push({
        id: uuidv4(),
        type: BrowserAIActionType.SCREENSHOT,
        reason: 'Capture screenshot as requested',
        riskLevel: RiskLevel.SAFE,
        requiresApproval: false,
      });
    }

    if (lowerTask.includes('scroll')) {
      actions.push({
        id: uuidv4(),
        type: BrowserAIActionType.SCROLL,
        options: { y: 500 },
        reason: 'Scroll down as requested',
        riskLevel: RiskLevel.SAFE,
        requiresApproval: false,
      });
    }

    if (lowerTask.includes('search')) {
      const queryMatch = task.match(
        /search\s+(?:for\s+)?['"]?(.+?)['"]?(?:\s+on|\s+in|$)/i
      );
      if (queryMatch) {
        actions.push({
          id: uuidv4(),
          type: BrowserAIActionType.TYPE,
          selector:
            'input[type="search"], input[name="q"], input[name="search"]',
          value: queryMatch[1],
          reason: `Search for "${queryMatch[1]}"`,
          riskLevel: RiskLevel.MEDIUM,
          requiresApproval: true,
        });
        actions.push({
          id: uuidv4(),
          type: BrowserAIActionType.CLICK,
          selector: 'button[type="submit"], input[type="submit"]',
          reason: 'Submit search',
          riskLevel: RiskLevel.MEDIUM,
          requiresApproval: true,
        });
      }
    }

    return {
      id: uuidv4(),
      actions,
      summary: `Planned ${actions.length} actions to: ${task}`,
      confidence: actions.length > 0 ? 0.85 : 0.3,
      reasoning: 'Analyzed task and created action sequence',
      userConfirmRequired: actions.some((a) => a.requiresApproval),
    };
  }

  async extractElements(_html: string): Promise<PageElement[]> {
    return [];
  }

  estimateActionRisk(action: BrowserAIAction): RiskLevel {
    if (SAFE_ACTIONS.includes(action.type)) {
      return RiskLevel.SAFE;
    }
    if (RISKY_ACTIONS.includes(action.type)) {
      return RiskLevel.HIGH;
    }
    return RiskLevel.MEDIUM;
  }
}
