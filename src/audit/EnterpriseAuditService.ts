import { EventEmitter } from 'events';
import {
  AuditCategory,
  EnterpriseAuditEvent,
  EnterpriseAuditEventType,
  EnterpriseAuditFilter,
  AuditAggregation,
  ComplianceReport,
  DataAccessRecord,
  ConsentRecord,
  ExportRequest,
  DataRetentionRule,
  AuditAlert,
  AlertRule,
  AlertCondition,
  AlertAction,
  DEFAULT_RETENTION_RULES,
} from './EnterpriseAuditTypes';

export interface IEnterpriseAuditRepository {
  save(event: EnterpriseAuditEvent): Promise<void>;
  saveBatch(events: EnterpriseAuditEvent[]): Promise<void>;
  findByFilter(filter: EnterpriseAuditFilter): Promise<EnterpriseAuditEvent[]>;
  aggregate(filter: EnterpriseAuditFilter): Promise<AuditAggregation>;
  deleteOlderThan(date: Date): Promise<number>;
  getDataAccessRecords(userId: string, startDate: Date, endDate: Date): Promise<DataAccessRecord[]>;
  getConsentRecords(userId: string): Promise<ConsentRecord[]>;
}

export interface EnterpriseAuditConfig {
  enabledCategories: AuditCategory[];
  retentionRules: DataRetentionRule[];
  redactPII: boolean;
  encryptSensitiveFields: boolean;
  alertRules: AlertRule[];
  realtimeAlerts: boolean;
  aggregationIntervalMs: number;
  batchSize: number;
  flushIntervalMs: number;
}

export const DEFAULT_AUDIT_CONFIG: EnterpriseAuditConfig = {
  enabledCategories: Object.values(AuditCategory),
  retentionRules: DEFAULT_RETENTION_RULES,
  redactPII: true,
  encryptSensitiveFields: true,
  alertRules: [],
  realtimeAlerts: false,
  aggregationIntervalMs: 60000,
  batchSize: 100,
  flushIntervalMs: 5000,
};

export class EnterpriseAuditService extends EventEmitter {
  private repository: IEnterpriseAuditRepository;
  private config: EnterpriseAuditConfig;
  private eventBuffer: EnterpriseAuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, AuditAlert> = new Map();

  constructor(
    repository: IEnterpriseAuditRepository,
    config?: Partial<EnterpriseAuditConfig>
  ) {
    super();
    this.repository = repository;
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    
    if (this.config.alertRules.length > 0) {
      this.config.alertRules.forEach(rule => this.alertRules.set(rule.id, rule));
    }

    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => console.error('[Audit] Flush error:', err));
    }, this.config.flushIntervalMs);
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.repository.saveBatch(events);
      console.log(`[Audit] Flushed ${events.length} events`);
    } catch (error) {
      console.error('[Audit] Batch save failed, re-queuing events:', error);
      this.eventBuffer.unshift(...events);
    }
  }

  async log(
    category: AuditCategory,
    eventType: EnterpriseAuditEventType,
    action: EnterpriseAuditEvent['action'],
    outcome: EnterpriseAuditEvent['outcome'],
    options: {
      userId?: string;
      targetUserId?: string;
      resourceType?: string;
      resourceId?: string;
      ipAddress?: string;
      userAgent?: string;
      provider?: string;
      metadata?: Record<string, unknown>;
      severity?: EnterpriseAuditEvent['severity'];
      complianceFlags?: string[];
    } = {}
  ): Promise<void> {
    if (!this.config.enabledCategories.includes(category)) {
      return;
    }

    const retentionRule = this.getRetentionRule(category, eventType);
    const severity = options.severity || this.determineSeverity(category, outcome);

    const event: EnterpriseAuditEvent = {
      id: this.generateId(),
      category,
      eventType,
      timestamp: new Date(),
      userId: options.userId,
      targetUserId: options.targetUserId,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      action,
      outcome,
      ipAddress: this.config.redactPII ? this.redactIP(options.ipAddress) : options.ipAddress,
      userAgent: options.userAgent,
      provider: options.provider,
      metadata: this.redactMetadata(options.metadata || {}, category, eventType),
      severity,
      complianceFlags: options.complianceFlags,
      retentionDays: retentionRule?.retentionDays,
    };

    this.eventBuffer.push(event);

    if (this.eventBuffer.length >= this.config.batchSize) {
      await this.flush();
    }

    if (this.config.realtimeAlerts) {
      await this.checkAlertRules(event);
    }

    this.emit('event', event);
  }

  private determineSeverity(
    category: AuditCategory,
    outcome: EnterpriseAuditEvent['outcome']
  ): EnterpriseAuditEvent['severity'] {
    if (outcome === 'blocked') return 'critical';
    if (outcome === 'failure') return 'warning';
    
    switch (category) {
      case AuditCategory.SECURITY:
        return 'critical';
      case AuditCategory.AUTHENTICATION:
        return 'info';
      case AuditCategory.AUTHORIZATION:
        return 'warning';
      default:
        return 'info';
    }
  }

  private getRetentionRule(
    category: AuditCategory,
    eventType: EnterpriseAuditEventType
  ): DataRetentionRule | undefined {
    return this.config.retentionRules.find(
      rule => rule.category === category && rule.eventType === eventType
    );
  }

  private redactIP(ip?: string): string | undefined {
    if (!ip) return undefined;
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return 'xxx.xxx.xxx.xxx';
  }

  private redactMetadata(
    metadata: Record<string, unknown>,
    category: AuditCategory,
    eventType: EnterpriseAuditEventType
  ): Record<string, unknown> {
    if (!this.config.redactPII) return metadata;

    const retentionRule = this.getRetentionRule(category, eventType);
    const fieldsToRedact = retentionRule?.PIIFieldsToRedact || [];

    const redacted = { ...metadata };
    for (const field of fieldsToRedact) {
      if (field in redacted) {
        redacted[field] = '[REDACTED]';
      }
    }

    const piiPatterns = ['password', 'secret', 'token', 'key', 'ssn', 'creditCard'];
    for (const key of Object.keys(redacted)) {
      if (piiPatterns.some(pattern => key.toLowerCase().includes(pattern))) {
        redacted[key] = '[REDACTED]';
      }
    }

    return redacted;
  }

  async logAuthentication(
    eventType: EnterpriseAuditEventType,
    userId: string,
    options: {
      outcome: EnterpriseAuditEvent['outcome'];
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.AUTHENTICATION,
      eventType,
      'access',
      options.outcome,
      { userId, ipAddress: options.ipAddress, userAgent: options.userAgent, metadata: options.metadata }
    );
  }

  async logAuthorization(
    eventType: EnterpriseAuditEventType,
    userId: string,
    options: {
      targetUserId?: string;
      resourceType?: string;
      resourceId?: string;
      outcome: EnterpriseAuditEvent['outcome'];
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.AUTHORIZATION,
      eventType,
      'access',
      options.outcome,
      {
        userId,
        targetUserId: options.targetUserId,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        metadata: options.metadata,
      }
    );
  }

  async logDataAccess(
    eventType: EnterpriseAuditEventType,
    userId: string,
    options: {
      resourceType: string;
      resourceId: string;
      action: EnterpriseAuditEvent['action'];
      outcome: EnterpriseAuditEvent['outcome'];
      ipAddress?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.DATA_ACCESS,
      eventType,
      options.action,
      options.outcome,
      {
        userId,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        ipAddress: options.ipAddress,
        metadata: options.metadata,
      }
    );
  }

  async logContent(
    eventType: EnterpriseAuditEventType,
    userId: string,
    options: {
      resourceId: string;
      action: EnterpriseAuditEvent['action'];
      outcome: EnterpriseAuditEvent['outcome'];
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.CONTENT,
      eventType,
      options.action,
      options.outcome,
      { userId, resourceType: 'content', resourceId: options.resourceId, metadata: options.metadata }
    );
  }

  async logSecurity(
    eventType: EnterpriseAuditEventType,
    options: {
      userId?: string;
      ipAddress?: string;
      severity?: EnterpriseAuditEvent['severity'];
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.SECURITY,
      eventType,
      'access',
      'failure',
      {
        userId: options.userId,
        ipAddress: options.ipAddress,
        severity: options.severity || 'critical',
        metadata: options.metadata,
      }
    );
  }

  async logCompliance(
    eventType: EnterpriseAuditEventType,
    userId: string,
    options: {
      metadata?: Record<string, unknown>;
      complianceFlags?: string[];
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.COMPLIANCE,
      eventType,
      'access',
      'success',
      { userId, metadata: options.metadata, complianceFlags: options.complianceFlags }
    );
  }

  async logGateway(
    eventType: EnterpriseAuditEventType,
    options: {
      userId?: string;
      resourceType?: string;
      outcome: EnterpriseAuditEvent['outcome'];
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.GATEWAY,
      eventType,
      'access',
      options.outcome,
      { userId: options.userId, resourceType: options.resourceType, metadata: options.metadata }
    );
  }

  async logShard(
    eventType: EnterpriseAuditEventType,
    options: {
      resourceId?: string;
      outcome: EnterpriseAuditEvent['outcome'];
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.log(
      AuditCategory.SHARD,
      eventType,
      'execute',
      options.outcome,
      { resourceId: options.resourceId, metadata: options.metadata, severity: 'warning' }
    );
  }

  private async checkAlertRules(event: EnterpriseAuditEvent): Promise<void> {
    for (const [_, rule] of this.alertRules) {
      if (!rule.enabled) continue;

      if (this.matchesAlertCondition(event, rule.condition)) {
        const alert = await this.createAlert(rule, event);
        this.activeAlerts.set(alert.id, alert);
        this.emit('alert', alert);

        for (const action of rule.actions) {
          await this.executeAlertAction(action, alert, event);
        }
      }
    }
  }

  private matchesAlertCondition(event: EnterpriseAuditEvent, condition: AlertCondition): boolean {
    if (condition.eventTypes && !condition.eventTypes.includes(event.eventType as any)) {
      return false;
    }
    if (condition.categories && !condition.categories.includes(event.category)) {
      return false;
    }
    if (condition.userId && condition.userId !== event.userId) {
      return false;
    }
    if (condition.resourceType && condition.resourceType !== event.resourceType) {
      return false;
    }
    return true;
  }

  private async createAlert(rule: AlertRule, event: EnterpriseAuditEvent): Promise<AuditAlert> {
    return {
      id: this.generateId(),
      ruleId: rule.id,
      eventId: event.id,
      severity: rule.severity,
      message: `Alert triggered: ${rule.name} - ${event.eventType}`,
      triggeredAt: new Date(),
    };
  }

  private async executeAlertAction(action: AlertAction, alert: AuditAlert, event: EnterpriseAuditEvent): Promise<void> {
    switch (action.type) {
      case 'email':
        console.log(`[Audit] Email alert: ${alert.message}`);
        break;
      case 'webhook':
        console.log(`[Audit] Webhook alert: ${alert.message}`);
        break;
      case 'notification':
        this.emit('notification', alert);
        break;
      case 'auto_block':
        if (event.ipAddress) {
          console.log(`[Audit] Auto-blocking IP: ${event.ipAddress}`);
          this.emit('autoBlock', { ipAddress: event.ipAddress, alert });
        }
        break;
    }
  }

  async addAlertRule(rule: AlertRule): Promise<void> {
    this.alertRules.set(rule.id, rule);
    if (!this.config.alertRules.find(r => r.id === rule.id)) {
      this.config.alertRules.push(rule);
    }
  }

  async removeAlertRule(ruleId: string): Promise<void> {
    this.alertRules.delete(ruleId);
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = userId;
      this.emit('alertAcknowledged', alert);
    }
  }

  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      this.activeAlerts.delete(alertId);
      this.emit('alertResolved', alert);
    }
  }

  async query(filter: EnterpriseAuditFilter): Promise<EnterpriseAuditEvent[]> {
    return this.repository.findByFilter(filter);
  }

  async aggregate(filter: EnterpriseAuditFilter): Promise<AuditAggregation> {
    return this.repository.aggregate(filter);
  }

  async generateComplianceReport(
    userId: string,
    period: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    const filter: EnterpriseAuditFilter = {
      userId,
      startDate: period.start,
      endDate: period.end,
    };

    const events = await this.query(filter);
    const summary = await this.aggregate(filter);
    const dataAccessLog = await this.repository.getDataAccessRecords(userId, period.start, period.end);
    const consentLog = await this.repository.getConsentRecords(userId);

    return {
      id: this.generateId(),
      generatedAt: new Date(),
      period,
      userId,
      events,
      summary,
      dataAccessLog,
      consentLog,
      exportRequests: [],
    };
  }

  async runRetentionPolicy(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 2555);
    return this.repository.deleteOlderThan(cutoffDate);
  }

  getActiveAlerts(): AuditAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  updateConfig(config: Partial<EnterpriseAuditConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  getConfig(): EnterpriseAuditConfig {
    return { ...this.config };
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    console.log('[Audit] Service shutdown complete');
  }
}

export const createEnterpriseAuditService = (
  repository: IEnterpriseAuditRepository,
  config?: Partial<EnterpriseAuditConfig>
): EnterpriseAuditService => {
  return new EnterpriseAuditService(repository, config);
};
