export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  CONTENT = 'content',
  AI_TASKS = 'ai_tasks',
  SHARD = 'shard',
  GATEWAY = 'gateway',
  SECURITY = 'security',
  COMPLIANCE = 'compliance',
}

export enum AuthenticationEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  TOKEN_REFRESHED = 'token_refreshed',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  SESSION_EXPIRED = 'session_expired',
}

export enum AuthorizationEventType {
  ROLE_CHANGED = 'role_changed',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  ACCESS_DENIED = 'access_denied',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
}

export enum DataAccessEventType {
  RECORD_READ = 'record_read',
  RECORD_WRITE = 'record_write',
  RECORD_DELETED = 'record_deleted',
  BULK_EXPORT = 'bulk_export',
  QUERY_EXECUTED = 'query_executed',
}

export enum ContentEventType {
  POST_CREATED = 'post_created',
  POST_UPDATED = 'post_updated',
  POST_DELETED = 'post_deleted',
  THREAD_CREATED = 'thread_created',
  THREAD_UPDATED = 'thread_updated',
  THREAD_DELETED = 'thread_deleted',
  CONTENT_REPORTED = 'content_reported',
  CONTENT_MODERATED = 'content_moderated',
}

export enum ShardEventType {
  SHARD_MIGRATION_STARTED = 'shard_migration_started',
  SHARD_MIGRATION_COMPLETED = 'shard_migration_completed',
  SHARD_MIGRATION_FAILED = 'shard_migration_failed',
  SHARD_REBALANCING_STARTED = 'shard_rebalancing_started',
  SHARD_REBALANCING_COMPLETED = 'shard_rebalancing_completed',
  SHARD_HEALTH_ALERT = 'shard_health_alert',
}

export enum GatewayEventType {
  REQUEST_RECEIVED = 'request_received',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  BACKEND_ERROR = 'backend_error',
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
}

export enum SecurityEventType {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  INTRUSION_ATTEMPT = 'intrusion_attempt',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  CREDENTIAL_COMPROMISED = 'credential_compromised',
  API_ABUSE_DETECTED = 'api_abuse_detected',
}

export enum ComplianceEventType {
  CONSENT_RECORDED = 'consent_recorded',
  CONSENT_REVOKED = 'consent_revoked',
  DATA_EXPORT_REQUESTED = 'data_export_requested',
  DATA_DELETION_REQUESTED = 'data_deletion_requested',
  GDPR_REQUEST = 'gdpr_request',
  AUDIT_LOG_ACCESSED = 'audit_log_accessed',
}

export type EnterpriseAuditEventType =
  | AuthenticationEventType
  | AuthorizationEventType
  | DataAccessEventType
  | ContentEventType
  | ShardEventType
  | GatewayEventType
  | SecurityEventType
  | ComplianceEventType;

export interface EnterpriseAuditEvent {
  id: string;
  category: AuditCategory;
  eventType: EnterpriseAuditEventType;
  timestamp: Date;
  userId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'execute' | 'access' | 'deny';
  outcome: 'success' | 'failure' | 'blocked';
  ipAddress?: string;
  userAgent?: string;
  provider?: string;
  metadata: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
  complianceFlags?: string[];
  retentionDays?: number;
}

export interface EnterpriseAuditFilter {
  categories?: AuditCategory[];
  eventTypes?: EnterpriseAuditEventType[];
  userId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
  severity?: string;
  limit?: number;
  offset?: number;
}

export interface AuditAggregation {
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  byEventType: Record<EnterpriseAuditEventType, number>;
  byOutcome: Record<string, number>;
  bySeverity: Record<string, number>;
  timeSeries: Array<{ date: string; count: number; category: AuditCategory }>;
  topUsers: Array<{ userId: string; count: number }>;
  topResources: Array<{ resourceType: string; count: number }>;
}

export interface ComplianceReport {
  id: string;
  generatedAt: Date;
  period: { start: Date; end: Date };
  userId?: string;
  events: EnterpriseAuditEvent[];
  summary: AuditAggregation;
  dataAccessLog: DataAccessRecord[];
  consentLog: ConsentRecord[];
  exportRequests: ExportRequest[];
}

export interface DataAccessRecord {
  userId: string;
  resourceType: string;
  resourceId: string;
  accessType: 'read' | 'write' | 'delete';
  timestamp: Date;
  ipAddress?: string;
}

export interface ConsentRecord {
  userId: string;
  consentType: 'explicit' | 'implicit';
  categories: string[];
  grantedAt: Date;
  revokedAt?: Date;
  purpose: string;
}

export interface ExportRequest {
  userId: string;
  requestType: 'access' | 'deletion' | 'portability';
  requestedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'completed' | 'rejected';
}

export interface DataRetentionRule {
  category: AuditCategory;
  eventType: EnterpriseAuditEventType;
  retentionDays: number;
  archiveAfterDays?: number;
  PIIFieldsToRedact: string[];
  requiresEncryption: boolean;
}

export const DEFAULT_RETENTION_RULES: DataRetentionRule[] = [
  { category: AuditCategory.AUTHENTICATION, eventType: AuthenticationEventType.LOGIN_SUCCESS, retentionDays: 365, PIIFieldsToRedact: ['password'], requiresEncryption: false },
  { category: AuditCategory.AUTHENTICATION, eventType: AuthenticationEventType.LOGIN_FAILED, retentionDays: 730, PIIFieldsToRedact: [], requiresEncryption: false },
  { category: AuditCategory.AUTHORIZATION, eventType: AuthorizationEventType.ACCESS_DENIED, retentionDays: 365, PIIFieldsToRedact: [], requiresEncryption: false },
  { category: AuditCategory.SECURITY, eventType: SecurityEventType.SUSPICIOUS_ACTIVITY, retentionDays: 2555, PIIFieldsToRedact: [], requiresEncryption: true },
  { category: AuditCategory.COMPLIANCE, eventType: ComplianceEventType.CONSENT_RECORDED, retentionDays: 2555, PIIFieldsToRedact: [], requiresEncryption: false },
  { category: AuditCategory.AI_TASKS, eventType: null as any, retentionDays: 730, PIIFieldsToRedact: ['input.prompt', 'output.content'], requiresEncryption: false },
  { category: AuditCategory.DATA_ACCESS, eventType: DataAccessEventType.BULK_EXPORT, retentionDays: 2555, PIIFieldsToRedact: [], requiresEncryption: true },
];

export interface AuditAlert {
  id: string;
  ruleId: string;
  eventId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: AlertAction[];
}

export interface AlertCondition {
  eventTypes?: EnterpriseAuditEventType[];
  categories?: AuditCategory[];
  threshold?: number;
  timeWindowMs?: number;
  userId?: string;
  resourceType?: string;
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'notification' | 'auto_block';
  config: Record<string, unknown>;
}
