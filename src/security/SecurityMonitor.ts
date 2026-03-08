import { EventEmitter } from 'events';
import { EnterpriseAuditService } from '../audit/EnterpriseAuditService';
import { AuditCategory, SecurityEventType } from '../audit/EnterpriseAuditTypes';

export enum SecurityEvent {
  FAILED_LOGIN = 'failed_login',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  CREDENTIAL_COMPROMISED = 'credential_compromised',
  API_ABUSE = 'api_abuse',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  INTRUSION_ATTEMPT = 'intrusion_attempt',
}

export interface SecurityAlert {
  id: string;
  event: SecurityEvent;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  userId?: string;
  ipAddress?: string;
  metadata: Record<string, unknown>;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
}

export interface SecurityRule {
  id: string;
  name: string;
  event: SecurityEvent;
  condition: SecurityCondition;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: SecurityAction[];
}

export interface SecurityCondition {
  threshold?: number;
  windowMs?: number;
  userId?: string;
  ipAddress?: string;
  resourceType?: string;
}

export interface SecurityAction {
  type: 'alert' | 'block' | 'rate_limit' | 'notify' | 'log';
  config: Record<string, unknown>;
}

export class SecurityMonitor extends EventEmitter {
  private auditService: EnterpriseAuditService;
  private rules: Map<string, SecurityRule>;
  private alerts: Map<string, SecurityAlert>;
  private eventCounters: Map<string, { count: number; windowStart: number }>;
  private blockedIPs: Set<string>;
  private blockedUsers: Set<string>;
  private checkInterval: NodeJS.Timeout | null;

  constructor(auditService: EnterpriseAuditService) {
    super();
    this.auditService = auditService;
    this.rules = new Map();
    this.alerts = new Map();
    this.eventCounters = new Map();
    this.blockedIPs = new Set();
    this.blockedUsers = new Set();
    this.checkInterval = null;
  }

  async start(): Promise<void> {
    this.checkInterval = setInterval(() => {
      this.processEventCounters();
    }, 60000);
    console.log('[Security] Monitor started');
  }

  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[Security] Monitor stopped');
  }

  addRule(rule: SecurityRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[Security] Rule added: ${rule.name}`);
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  async recordEvent(
    event: SecurityEvent,
    options: {
      userId?: string;
      ipAddress?: string;
      resourceType?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (this.isBlocked(options.ipAddress, options.userId)) {
      console.log(`[Security] Blocked request from IP: ${options.ipAddress}, User: ${options.userId}`);
      return;
    }

    await this.auditService.logSecurity(SecurityEventType.SUSPICIOUS_ACTIVITY, {
      userId: options.userId,
      ipAddress: options.ipAddress,
      metadata: { event, ...options.metadata },
    });

    this.incrementEventCounter(event, options.userId, options.ipAddress);
    await this.evaluateRules(event, options);
  }

  private incrementEventCounter(event: SecurityEvent, userId?: string, ipAddress?: string): void {
    const key = `${event}:${userId || 'unknown'}:${ipAddress || 'unknown'}`;
    const now = Date.now();
    const counter = this.eventCounters.get(key);

    if (!counter || now - counter.windowStart > 60000) {
      this.eventCounters.set(key, { count: 1, windowStart: now });
    } else {
      counter.count++;
    }
  }

  private async processEventCounters(): Promise<void> {
    const now = Date.now();
    for (const [key, counter] of this.eventCounters.entries()) {
      if (now - counter.windowStart > 60000) {
        this.eventCounters.delete(key);
      }
    }
  }

  private async evaluateRules(
    event: SecurityEvent,
    options: { userId?: string; ipAddress?: string; resourceType?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    for (const [, rule] of this.rules) {
      if (!rule.enabled || rule.event !== event) continue;

      const triggered = this.checkCondition(rule.condition, options);
      if (triggered) {
        await this.triggerRule(rule, options);
      }
    }
  }

  private checkCondition(condition: SecurityCondition, options: { userId?: string; ipAddress?: string; resourceType?: string }): boolean {
    if (condition.userId && condition.userId !== options.userId) return false;
    if (condition.ipAddress && condition.ipAddress !== options.ipAddress) return false;
    if (condition.resourceType && condition.resourceType !== options.resourceType) return false;

    if (condition.threshold) {
      const key = `${condition.userId || ''}:${condition.ipAddress || ''}`;
      const counter = this.eventCounters.get(key);
      if (!counter || counter.count < condition.threshold) return false;
    }

    return true;
  }

  private async triggerRule(rule: SecurityRule, options: { userId?: string; ipAddress?: string; metadata?: Record<string, unknown> }): Promise<void> {
    const alert = this.createAlert(rule, options);
    this.alerts.set(alert.id, alert);

    this.emit('alert', alert);

    for (const action of rule.actions) {
      await this.executeAction(action, alert, options);
    }
  }

  private createAlert(rule: SecurityRule, options: { userId?: string; ipAddress?: string; metadata?: Record<string, unknown> }): SecurityAlert {
    return {
      id: this.generateId(),
      event: rule.event,
      severity: rule.severity,
      message: `Security rule triggered: ${rule.name}`,
      userId: options.userId,
      ipAddress: options.ipAddress,
      metadata: options.metadata || {},
      triggeredAt: new Date(),
    };
  }

  private async executeAction(action: SecurityAction, alert: SecurityAlert, options: { userId?: string; ipAddress?: string }): Promise<void> {
    switch (action.type) {
      case 'alert':
        console.log(`[Security] Alert: ${alert.message}`);
        break;
      case 'block':
        if (options.ipAddress) this.blockIP(options.ipAddress);
        if (options.userId) this.blockUser(options.userId);
        break;
      case 'rate_limit':
        console.log(`[Security] Rate limit applied to user: ${options.userId}`);
        break;
      case 'notify':
        this.emit('notification', alert);
        break;
      case 'log':
        console.log(`[Security] Logged: ${alert.message}`);
        break;
    }
  }

  blockIP(ip: string): void {
    this.blockedIPs.add(ip);
    console.log(`[Security] IP blocked: ${ip}`);
  }

  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
    console.log(`[Security] IP unblocked: ${ip}`);
  }

  blockUser(userId: string): void {
    this.blockedUsers.add(userId);
    console.log(`[Security] User blocked: ${userId}`);
  }

  unblockUser(userId: string): void {
    this.blockedUsers.delete(userId);
    console.log(`[Security] User unblocked: ${userId}`);
  }

  isBlocked(ip?: string, userId?: string): boolean {
    if (ip && this.blockedIPs.has(ip)) return true;
    if (userId && this.blockedUsers.has(userId)) return true;
    return false;
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = userId;
      this.emit('alertAcknowledged', alert);
    }
  }

  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      this.alerts.delete(alertId);
      this.emit('alertResolved', alert);
    }
  }

  getActiveAlerts(): SecurityAlert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolvedAt);
  }

  getBlockedIPs(): string[] {
    return Array.from(this.blockedIPs);
  }

  getBlockedUsers(): string[] {
    return Array.from(this.blockedUsers);
  }

  private generateId(): string {
    return `security_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
