import {
  AuditEvent,
  AuditEventType,
  AuditFilter,
  AuditSummary,
  ComplianceRecord,
  DataRetentionPolicy,
  DEFAULT_RETENTION_POLICY,
} from './AuditTypes';

export interface IAuditRepository {
  save(event: AuditEvent): Promise<void>;
  findByFilter(filter: AuditFilter): Promise<AuditEvent[]>;
  getSummary(filter?: AuditFilter): Promise<AuditSummary>;
  deleteOlderThan(date: Date): Promise<number>;
}

export interface AuditServiceConfig {
  enablePIIRedaction: boolean;
  enableComplianceTracking: boolean;
  retentionPolicies: DataRetentionPolicy[];
}

export const DEFAULT_AUDIT_CONFIG: AuditServiceConfig = {
  enablePIIRedaction: true,
  enableComplianceTracking: true,
  retentionPolicies: DEFAULT_RETENTION_POLICY,
};

export class AuditService {
  private repository: IAuditRepository;
  private config: AuditServiceConfig;

  constructor(repository: IAuditRepository, config?: Partial<AuditServiceConfig>) {
    this.repository = repository;
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
  }

  async logTaskCreated(
    taskId: string,
    userId: string,
    provider: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.TASK_CREATED, { taskId, userId, provider, metadata });
  }

  async logTaskStarted(
    taskId: string,
    userId: string,
    provider: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.TASK_STARTED, { taskId, userId, provider, metadata });
  }

  async logTaskCompleted(
    taskId: string,
    userId: string,
    provider: string,
    output: { tokensUsed?: number; finishReason: string },
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.TASK_COMPLETED, {
      taskId,
      userId,
      provider,
      metadata: { ...this.redactPII(metadata, AuditEventType.TASK_COMPLETED), ...output },
    });
  }

  async logTaskFailed(
    taskId: string,
    userId: string,
    provider: string,
    error: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.TASK_FAILED, {
      taskId,
      userId,
      provider,
      metadata: { ...this.redactPII(metadata), error },
    });
  }

  async logTaskCancelled(
    taskId: string,
    userId: string,
    reason?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.TASK_CANCELLED, {
      taskId,
      userId,
      metadata: { ...this.redactPII(metadata), reason },
    });
  }

  async logTaskRetry(
    taskId: string,
    userId: string,
    retryCount: number,
    previousError?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.TASK_RETRY, {
      taskId,
      userId,
      metadata: { ...this.redactPII(metadata), retryCount, previousError },
    });
  }

  async logProviderSwitched(
    taskId: string,
    userId: string,
    fromProvider: string,
    toProvider: string,
    reason: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.PROVIDER_SWITCHED, {
      taskId,
      userId,
      metadata: { ...this.redactPII(metadata), fromProvider, toProvider, reason },
    });
  }

  async logRateLimitHit(
    userId: string,
    provider: string,
    limit: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.RATE_LIMIT_HIT, {
      userId,
      provider,
      metadata: { ...this.redactPII(metadata), limit },
    });
  }

  async logDataAccess(
    userId: string,
    dataCategory: string,
    purpose: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log(AuditEventType.DATA_ACCESSED, {
      userId,
      metadata: { ...this.redactPII(metadata), dataCategory, purpose },
    });
  }

  async logAIOutputGenerated(
    taskId: string,
    userId: string,
    provider: string,
    input: string,
    output: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const redacted = this.config.enablePIIRedaction
      ? {
          ...this.redactPII(metadata, AuditEventType.AI_OUTPUT_GENERATED),
          inputLength: input.length,
          outputLength: output.length,
        }
      : {
          ...this.redactPII(metadata),
          input: input.substring(0, 100) + '...',
          output: output.substring(0, 100) + '...',
        };

    await this.log(AuditEventType.AI_OUTPUT_GENERATED, {
      taskId,
      userId,
      provider,
      metadata: redacted,
    });
  }

  async recordUserConsent(
    userId: string,
    taskId: string,
    consentType: 'explicit' | 'implicit',
    dataCategories: string[],
    purpose: string
  ): Promise<void> {
    await this.log(AuditEventType.USER_CONSENT_RECORDED, {
      taskId,
      userId,
      metadata: { consentType, dataCategories, purpose },
    });
  }

  async getAuditLog(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.repository.findByFilter(filter);
  }

  async getAuditSummary(filter?: AuditFilter): Promise<AuditSummary> {
    return this.repository.getSummary(filter);
  }

  async purgeOldEvents(olderThanDays: number): Promise<number> {
    let totalDeleted = 0;

    for (const policy of this.config.retentionPolicies) {
      const days = policy.archiveAfterDays ?? policy.retentionDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const deleted = await this.repository.deleteOlderThan(cutoffDate);
      totalDeleted += deleted;
    }

    return totalDeleted;
  }

  private async log(
    eventType: AuditEventType,
    event: { taskId?: string; userId: string; provider?: string; metadata: Record<string, unknown> }
  ): Promise<void> {
    const fullEvent: AuditEvent = {
      id: crypto.randomUUID(),
      eventType,
      timestamp: new Date(),
      ...event,
    };
    await this.repository.save(fullEvent);
  }

  private redactPII(metadata: Record<string, unknown>, eventType?: AuditEventType): Record<string, unknown> {
    if (!this.config.enablePIIRedaction) {
      return metadata;
    }

    const piiFields = ['password', 'apiKey', 'token', 'secret', 'creditCard', 'ssn'];
    let redacted = this.redactNested(metadata, piiFields);

    if (eventType) {
      const policy = this.config.retentionPolicies.find(p => p.eventType === eventType);
      if (policy?.PIIFieldsToRedact?.length) {
        redacted = this.redactByPolicy(redacted as Record<string, unknown>, policy.PIIFieldsToRedact);
      }
    }

    return redacted as Record<string, unknown>;
  }

  private redactNested(obj: unknown, piiFields: string[]): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactNested(item, piiFields));
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (piiFields.some(field => key.toLowerCase().includes(field))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.redactNested(value, piiFields);
        }
      }
      return result;
    }

    return obj;
  }

  private redactByPolicy(obj: unknown, fieldsToRedact: string[]): unknown {
    for (const field of fieldsToRedact) {
      const parts = field.split('.');
      this.redactFieldAtPath(obj, parts, '[REDACTED]');
    }
    return obj;
  }

  private redactFieldAtPath(obj: unknown, path: string[], value: unknown): void {
    if (!obj || path.length === 0) return;

    if (path.length === 1) {
      if (typeof obj === 'object' && obj !== null) {
        (obj as Record<string, unknown>)[path[0]] = value;
      }
      return;
    }

    const current = (obj as Record<string, unknown>)[path[0]];
    if (typeof current === 'object' && current !== null) {
      this.redactFieldAtPath(current, path.slice(1), value);
    }
  }

  updateConfig(config: Partial<AuditServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AuditServiceConfig {
    return { ...this.config };
  }
}
