export enum BrowserAIActionType {
  NAVIGATE = 'navigate',
  CLICK = 'click',
  TYPE = 'type',
  SCROLL = 'scroll',
  SELECT = 'select',
  SUBMIT = 'submit',
  WAIT = 'wait',
  EXTRACT = 'extract',
  SCREENSHOT = 'screenshot',
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  html?: string;
  screenshot?: string;
  visible: boolean;
}

export interface PageElement {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  href?: string;
  src?: string;
  placeholder?: string;
  value?: string;
  type?: string;
  selector: string;
  xpath: string;
}

export interface BrowserAIAction {
  id: string;
  type: BrowserAIActionType;
  selector?: string;
  value?: string;
  options?: Record<string, any>;
  reason: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export enum RiskLevel {
  SAFE = 'safe',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AIActionSuggestion {
  id: string;
  actions: BrowserAIAction[];
  summary: string;
  confidence: number;
  reasoning: string;
  userConfirmRequired: boolean;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  userId: string;
  actions: BrowserAIAction[];
  context: string;
  status: ApprovalStatus;
  createdAt: Date;
  respondedAt?: Date;
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  EXPIRED = 'expired',
}

export interface BrowserAIContext {
  userId: string;
  conversationId?: string;
  task?: string;
  preferences?: {
    autoApproveSafeActions?: boolean;
    notifyOnCompletion?: boolean;
  };
}

export interface BrowserAIResult {
  success: boolean;
  content?: PageContent;
  actions?: BrowserAIAction[];
  approvalRequest?: ApprovalRequest;
  error?: string;
}
