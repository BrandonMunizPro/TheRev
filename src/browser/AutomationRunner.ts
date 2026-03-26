import {
  BrowserManager,
  ActionType,
  ActionResult,
  AutomationAction,
  ScreenshotOptions,
} from './BrowserManager';
import { ErrorHandler } from '../errors/ErrorHandler';

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  actions: AutomationAction[];
  createdAt: Date;
}

export interface AutomationExecution {
  id: string;
  templateId: string;
  status: ExecutionStatus;
  results: ActionResult[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export class AutomationTemplates {
  private templates: Map<string, AutomationTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    this.register({
      id: 'navigate-url',
      name: 'Navigate to URL',
      description: 'Navigate to a specific URL',
      actions: [{ type: ActionType.NAVIGATE, value: '{{url}}' }],
    });

    this.register({
      id: 'fill-login-form',
      name: 'Fill Login Form',
      description: 'Fill and submit a login form',
      actions: [
        { type: ActionType.NAVIGATE, value: '{{url}}' },
        { type: ActionType.WAIT, value: 1000 },
        {
          type: ActionType.FILL,
          value: [
            { selector: '{{usernameSelector}}', value: '{{username}}' },
            { selector: '{{passwordSelector}}', value: '{{password}}' },
          ],
        },
        { type: ActionType.CLICK, selector: '{{submitSelector}}' },
        { type: ActionType.WAIT_FOR_NAVIGATION, options: { timeout: 5000 } },
      ],
    });

    this.register({
      id: 'fill-contact-form',
      name: 'Fill Contact Form',
      description: 'Fill out a contact form and submit',
      actions: [
        { type: ActionType.NAVIGATE, value: '{{url}}' },
        { type: ActionType.WAIT, value: 500 },
        { type: ActionType.FILL, value: '{{formData}}' },
        { type: ActionType.SUBMIT, selector: '{{submitSelector}}' },
      ],
    });

    this.register({
      id: 'search-and-screenshot',
      name: 'Search and Screenshot',
      description: 'Navigate to a site, perform search, and take screenshot',
      actions: [
        { type: ActionType.NAVIGATE, value: '{{url}}' },
        { type: ActionType.WAIT_FOR_SELECTOR, selector: '{{searchInput}}' },
        {
          type: ActionType.TYPE,
          selector: '{{searchInput}}',
          value: '{{query}}',
        },
        { type: ActionType.PRESS_KEY, value: 'Enter' },
        { type: ActionType.WAIT, value: 2000 },
        { type: ActionType.SCREENSHOT, options: { type: 'png' } },
      ],
    });

    this.register({
      id: 'extract-data',
      name: 'Extract Data from Page',
      description: 'Navigate and extract specific data elements',
      actions: [
        { type: ActionType.NAVIGATE, value: '{{url}}' },
        {
          type: ActionType.WAIT_FOR_SELECTOR,
          selector: '{{containerSelector}}',
        },
        { type: ActionType.EVALUATE, value: '{{extractScript}}' },
      ],
    });

    this.register({
      id: 'scroll-and-capture',
      name: 'Scroll and Capture',
      description: 'Scroll through a page and capture screenshots',
      actions: [
        { type: ActionType.NAVIGATE, value: '{{url}}' },
        { type: ActionType.WAIT, value: 1000 },
        { type: ActionType.SCROLL, options: { y: 0 } },
        { type: ActionType.SCREENSHOT, options: { fullPage: false } },
        { type: ActionType.SCROLL, options: { behavior: 'smooth', y: 500 } },
        { type: ActionType.WAIT, value: 500 },
        { type: ActionType.SCREENSHOT, options: { fullPage: false } },
      ],
    });

    this.register({
      id: 'click-through',
      name: 'Click Through Elements',
      description: 'Click through a series of elements',
      actions: [
        { type: ActionType.NAVIGATE, value: '{{url}}' },
        { type: ActionType.WAIT, value: '{{initialWait}}' },
        ...this.generateClickSequence('{{selectors}}'),
      ],
    });
  }

  private generateClickSequence(selectorsStr: string): AutomationAction[] {
    return [{ type: ActionType.CLICK, selector: selectorsStr }];
  }

  register(template: {
    name: string;
    description: string;
    actions: AutomationAction[];
    id?: string;
  }): void {
    const fullTemplate: AutomationTemplate = {
      name: template.name,
      description: template.description,
      actions: template.actions,
      id: template.id || `template-${Date.now()}`,
      createdAt: new Date(),
    };
    this.templates.set(fullTemplate.id, fullTemplate);
  }

  get(id: string): AutomationTemplate | undefined {
    return this.templates.get(id);
  }

  getAll(): AutomationTemplate[] {
    return Array.from(this.templates.values());
  }

  delete(id: string): boolean {
    return this.templates.delete(id);
  }

  resolveTemplate(
    template: AutomationTemplate,
    variables: Record<string, any>
  ): AutomationAction[] {
    return template.actions.map((action) => {
      const resolved: AutomationAction = { ...action };

      if (typeof resolved.value === 'string') {
        resolved.value = this.resolveString(resolved.value, variables);
      }

      if (Array.isArray(resolved.value)) {
        resolved.value = resolved.value.map((item) => {
          if (typeof item === 'object' && item !== null) {
            return this.resolveObject(item, variables);
          }
          return item;
        });
      }

      if (resolved.selector) {
        resolved.selector = this.resolveString(resolved.selector, variables);
      }

      if (resolved.options) {
        resolved.options = this.resolveObject(resolved.options, variables);
      }

      return resolved;
    });
  }

  private resolveString(str: string, variables: Record<string, any>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] ?? `{{${key}}}`;
    });
  }

  private resolveObject(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.resolveString(obj, variables);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObject(item, variables));
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k,
          this.resolveObject(v, variables),
        ])
      );
    }
    return obj;
  }
}

export class AutomationRunner {
  private browserManager: BrowserManager;
  private templates: AutomationTemplates;
  private executions: Map<string, AutomationExecution> = new Map();

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
    this.templates = new AutomationTemplates();
  }

  getTemplates(): AutomationTemplates {
    return this.templates;
  }

  async run(
    templateId: string,
    variables: Record<string, any>,
    tabId?: string
  ): Promise<AutomationExecution> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw ErrorHandler.operationNotAllowed(
        `Template not found: ${templateId}`
      );
    }

    const execution: AutomationExecution = {
      id: `exec-${Date.now()}`,
      templateId,
      status: ExecutionStatus.RUNNING,
      results: [],
      startedAt: new Date(),
    };
    this.executions.set(execution.id, execution);

    let targetTabId = tabId;

    try {
      if (!targetTabId) {
        const sessionId = await this.browserManager.createSession({
          templateId,
        });
        const tab = await this.browserManager.createTab(sessionId);
        targetTabId = tab.id;
      }

      const resolvedActions = this.templates.resolveTemplate(
        template,
        variables
      );

      for (const action of resolvedActions) {
        const result = await this.browserManager.executeAction(
          targetTabId,
          action
        );
        execution.results.push(result);

        if (!result.success) {
          execution.status = ExecutionStatus.FAILED;
          execution.error = result.error;
          execution.completedAt = new Date();
          break;
        }
      }

      if (execution.status !== ExecutionStatus.FAILED) {
        execution.status = ExecutionStatus.COMPLETED;
      }
    } catch (error) {
      execution.status = ExecutionStatus.FAILED;
      execution.error = error instanceof Error ? error.message : String(error);
    }

    execution.completedAt = new Date();
    return execution;
  }

  getExecution(id: string): AutomationExecution | undefined {
    return this.executions.get(id);
  }

  getExecutionsByTemplate(templateId: string): AutomationExecution[] {
    return Array.from(this.executions.values()).filter(
      (e) => e.templateId === templateId
    );
  }

  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === ExecutionStatus.RUNNING) {
      execution.status = ExecutionStatus.CANCELLED;
      execution.completedAt = new Date();
    }
  }
}
