import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  BrowserSandbox,
  SandboxSession,
  SandboxConfig,
} from './BrowserSandbox';
import { ErrorHandler } from '../errors/ErrorHandler';

export interface BrowserTab {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  status: TabStatus;
  createdAt: Date;
  lastActivityAt: Date;
  memoryUsageMB: number;
}

export enum TabStatus {
  LOADING = 'LOADING',
  READY = 'READY',
  ERROR = 'ERROR',
  CLOSED = 'CLOSED',
}

export interface NavigationOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  headers?: Record<string, string>;
}

export interface ClickOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
}

export interface TypeOptions {
  delay?: number;
}

export interface ScrollOptions {
  behavior?: 'auto' | 'smooth';
  x?: number;
  y?: number;
}

export interface ScreenshotOptions {
  type?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  fullPage?: boolean;
}

export interface FormFillData {
  selector: string;
  value: string;
  options?: { value?: string; label?: string }[];
}

export interface AutomationAction {
  type: ActionType;
  selector?: string;
  options?: Record<string, any>;
  value?: any;
}

export enum ActionType {
  NAVIGATE = 'navigate',
  CLICK = 'click',
  DBLCLICK = 'dblclick',
  RIGHT_CLICK = 'right_click',
  TYPE = 'type',
  PRESS_KEY = 'press_key',
  SCROLL = 'scroll',
  WAIT = 'wait',
  WAIT_FOR_SELECTOR = 'wait_for_selector',
  WAIT_FOR_NAVIGATION = 'wait_for_navigation',
  SELECT = 'select',
  CHECK = 'check',
  UNCHECK = 'uncheck',
  HOVER = 'hover',
  FILL = 'fill',
  SUBMIT = 'submit',
  SCREENSHOT = 'screenshot',
  EVALUATE = 'evaluate',
  GET_TITLE = 'get_title',
  GET_URL = 'get_url',
  GET_TEXT = 'get_text',
  GET_ATTRIBUTE = 'get_attribute',
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  durationMs: number;
}

export class BrowserManager extends EventEmitter {
  private sandbox: BrowserSandbox;
  private tabs: Map<string, BrowserTab> = new Map();
  private browserInstances: Map<string, any> = new Map();

  constructor(sandboxConfig?: Partial<SandboxConfig>) {
    super();
    this.sandbox = new BrowserSandbox(sandboxConfig);
  }

  getSandbox(): BrowserSandbox {
    return this.sandbox;
  }

  async createSession(metadata?: Record<string, any>): Promise<string> {
    const session = this.sandbox.createSession(metadata);
    return session.id;
  }

  async createTab(
    sessionId: string,
    url: string = 'about:blank'
  ): Promise<BrowserTab> {
    const session = this.sandbox.getSession(sessionId);
    if (!session) {
      throw ErrorHandler.operationNotAllowed(`Session not found: ${sessionId}`);
    }

    const check = this.sandbox.checkResourceLimits();
    if (!check.allowed) {
      throw ErrorHandler.operationNotAllowed(check.reason);
    }

    const tab: BrowserTab = {
      id: uuidv4(),
      sessionId,
      url,
      title: '',
      status: TabStatus.LOADING,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      memoryUsageMB: 0,
    };

    this.tabs.set(tab.id, tab);
    session.tabCount++;
    this.sandbox.updateSessionActivity(sessionId);

    this.emit('tab:created', tab);
    return tab;
  }

  async closeTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw ErrorHandler.operationNotAllowed(`Tab not found: ${tabId}`);
    }

    const session = this.sandbox.getSession(tab.sessionId);
    if (session) {
      session.tabCount = Math.max(0, session.tabCount - 1);
    }

    tab.status = TabStatus.CLOSED;
    this.tabs.delete(tabId);

    this.emit('tab:closed', tab);
  }

  getTab(tabId: string): BrowserTab | undefined {
    return this.tabs.get(tabId);
  }

  getSessionTabs(sessionId: string): BrowserTab[] {
    return Array.from(this.tabs.values()).filter(
      (tab) => tab.sessionId === sessionId
    );
  }

  async navigate(
    tabId: string,
    url: string,
    options?: NavigationOptions
  ): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw ErrorHandler.operationNotAllowed(`Tab not found: ${tabId}`);
    }

    tab.url = url;
    tab.status = TabStatus.LOADING;
    this.sandbox.updateSessionActivity(tab.sessionId);

    this.emit('navigation:start', { tabId, url });
  }

  async executeAction(
    tabId: string,
    action: AutomationAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const tab = this.tabs.get(tabId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: ${tabId}`,
        durationMs: Date.now() - startTime,
      };
    }

    this.sandbox.updateSessionActivity(tab.sessionId);

    try {
      let result: any;

      switch (action.type) {
        case ActionType.CLICK:
          result = await this.handleClick(tabId, action.options);
          break;
        case ActionType.TYPE:
          result = await this.handleType(
            tabId,
            action.selector,
            action.value,
            action.options
          );
          break;
        case ActionType.SCROLL:
          result = await this.handleScroll(tabId, action.options);
          break;
        case ActionType.NAVIGATE:
          result = await this.handleNavigate(
            tabId,
            action.value,
            action.options
          );
          break;
        case ActionType.WAIT:
          result = await this.handleWait(action.value);
          break;
        case ActionType.FILL:
          result = await this.handleFill(tabId, action.value);
          break;
        case ActionType.SUBMIT:
          result = await this.handleSubmit(tabId, action.selector);
          break;
        case ActionType.SCREENSHOT:
          result = await this.handleScreenshot(tabId, action.options);
          break;
        case ActionType.EVALUATE:
          result = await this.handleEvaluate(tabId, action.value);
          break;
        case ActionType.GET_TEXT:
          result = await this.handleGetText(tabId, action.selector);
          break;
        case ActionType.GET_ATTRIBUTE:
          result = await this.handleGetAttribute(
            tabId,
            action.selector,
            action.options?.attribute
          );
          break;
        default:
          throw ErrorHandler.invalidInput(
            `Unknown action type: ${action.type}`
          );
      }

      tab.status = TabStatus.READY;
      return {
        success: true,
        data: result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      tab.status = TabStatus.ERROR;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async handleClick(
    tabId: string,
    options?: Record<string, any>
  ): Promise<any> {
    console.log(`Click on tab ${tabId}:`, options);
    return { clicked: true };
  }

  private async handleType(
    tabId: string,
    selector?: string,
    value?: string,
    options?: Record<string, any>
  ): Promise<any> {
    console.log(`Type on tab ${tabId}, selector ${selector}:`, value);
    return { typed: true, value };
  }

  private async handleScroll(
    tabId: string,
    options?: Record<string, any>
  ): Promise<any> {
    console.log(`Scroll on tab ${tabId}:`, options);
    return { scrolled: true };
  }

  private async handleNavigate(
    tabId: string,
    url: string,
    options?: Record<string, any>
  ): Promise<any> {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.url = url;
      tab.status = TabStatus.READY;
    }
    console.log(`Navigate tab ${tabId} to ${url}`);
    return { navigated: true, url };
  }

  private async handleWait(ms: number): Promise<any> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { waited: ms };
  }

  private async handleFill(tabId: string, data: FormFillData[]): Promise<any> {
    console.log(`Fill on tab ${tabId}:`, data);
    return { filled: data.length };
  }

  private async handleSubmit(tabId: string, selector?: string): Promise<any> {
    console.log(`Submit on tab ${tabId}, selector:`, selector);
    return { submitted: true };
  }

  private async handleScreenshot(
    tabId: string,
    options?: Record<string, any>
  ): Promise<any> {
    console.log(`Screenshot on tab ${tabId}:`, options);
    return { screenshot: true };
  }

  private async handleEvaluate(tabId: string, script: string): Promise<any> {
    console.log(`Evaluate on tab ${tabId}:`, script);
    return { evaluated: true };
  }

  private async handleGetText(tabId: string, selector?: string): Promise<any> {
    console.log(`Get text from tab ${tabId}, selector:`, selector);
    return { text: '' };
  }

  private async handleGetAttribute(
    tabId: string,
    selector?: string,
    attribute?: string
  ): Promise<any> {
    console.log(
      `Get attribute from tab ${tabId}, selector:`,
      selector,
      'attribute:',
      attribute
    );
    return { attribute: '' };
  }

  async executeActionSequence(
    tabId: string,
    actions: AutomationAction[]
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(tabId, action);
      results.push(result);

      if (!result.success) {
        break;
      }
    }

    return results;
  }

  async fillForm(
    tabId: string,
    formData: FormFillData[]
  ): Promise<ActionResult> {
    return this.executeAction(tabId, {
      type: ActionType.FILL,
      value: formData,
    });
  }

  async submitForm(tabId: string, selector?: string): Promise<ActionResult> {
    return this.executeAction(tabId, {
      type: ActionType.SUBMIT,
      selector,
    });
  }

  async takeScreenshot(
    tabId: string,
    options?: ScreenshotOptions
  ): Promise<ActionResult> {
    return this.executeAction(tabId, {
      type: ActionType.SCREENSHOT,
      options,
    });
  }

  getMetrics() {
    return {
      sandbox: this.sandbox.getMetrics(),
      tabs: this.tabs.size,
    };
  }

  async shutdown(): Promise<void> {
    const closePromises = Array.from(this.tabs.keys()).map((id) =>
      this.closeTab(id)
    );
    await Promise.all(closePromises);
    await this.sandbox.shutdown();
  }
}
