export enum AuditEventType {
  TASK_CREATED = 'task_created',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',
  TASK_RETRY = 'task_retry',
  TASK_QUEUED = 'task_queued',
  TASK_DEQUEUED = 'task_dequeued',
  PROVIDER_SWITCHED = 'provider_switched',
  RATE_LIMIT_HIT = 'rate_limit_hit',
  USER_CONSENT_RECORDED = 'user_consent_recorded',
  DATA_ACCESSED = 'data_accessed',
  AI_OUTPUT_GENERATED = 'ai_output_generated',
}

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  taskId?: string;
  userId: string;
  timestamp: Date;
  provider?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditFilter {
  userId?: string;
  taskId?: string;
  eventType?: AuditEventType | AuditEventType[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalEvents: number;
  byEventType: Record<AuditEventType, number>;
  byProvider: Record<string, number>;
  byUser: Record<string, number>;
  timeSeries: Array<{ date: string; count: number }>;
}

export interface ComplianceRecord {
  id: string;
  userId: string;
  taskId: string;
  consentType: 'explicit' | 'implicit';
  consentGivenAt: Date;
  dataCategories: string[];
  purpose: string;
  expiresAt?: Date;
  revokedAt?: Date;
}

export interface DataRetentionPolicy {
  eventType: AuditEventType;
  retentionDays: number;
  archiveAfterDays?: number;
  PIIFieldsToRedact: string[];
}

export const DEFAULT_RETENTION_POLICY: DataRetentionPolicy[] = [
  { eventType: AuditEventType.TASK_CREATED, retentionDays: 365, PIIFieldsToRedact: [] },
  { eventType: AuditEventType.TASK_COMPLETED, retentionDays: 730, PIIFieldsToRedact: ['input.prompt'] },
  { eventType: AuditEventType.AI_OUTPUT_GENERATED, retentionDays: 730, PIIFieldsToRedact: ['output.content'] },
  { eventType: AuditEventType.USER_CONSENT_RECORDED, retentionDays: 2555, PIIFieldsToRedact: [] },
  { eventType: AuditEventType.DATA_ACCESSED, retentionDays: 365, PIIFieldsToRedact: ['ipAddress'] },
];
