import { EventEmitter } from 'events';
import { AuditCategory } from '../audit/EnterpriseAuditTypes';

export interface ShardSecurityPolicy {
  id: string;
  shardId: string;
  shardType: 'users' | 'content';
  name: string;
  description: string;
  enabled: boolean;
  accessControl: ShardAccessControl;
  rateLimiting: ShardRateLimit;
  encryption: ShardEncryption;
  auditLogging: ShardAuditConfig;
  quarantineThreshold: QuarantineThreshold;
}

export interface ShardAccessControl {
  allowedRoles: string[];
  blockedRoles: string[];
  allowedUsers: string[];
  blockedUsers: string[];
  requireMFA: boolean;
  ipWhitelist: string[];
  ipBlacklist: string[];
}

export interface ShardRateLimit {
  enabled: boolean;
  maxRequestsPerMinute: number;
  maxConnectionsPerUser: number;
  burstSize: number;
}

export interface ShardEncryption {
  enabled: boolean;
  atRest: boolean;
  inTransit: boolean;
  keyRotationDays: number;
}

export interface ShardAuditConfig {
  enabled: boolean;
  logReads: boolean;
  logWrites: boolean;
  logDeletes: boolean;
  logAdminActions: boolean;
  retentionDays: number;
}

export interface QuarantineThreshold {
  enabled: boolean;
  errorRatePercent: number;
  latencyMs: number;
  failedConnections: number;
  autoQuarantine: boolean;
}

export interface ShardSecurityStatus {
  shardId: string;
  isHealthy: boolean;
  isQuarantined: boolean;
  quarantineReason?: string;
  currentLoad: number;
  activeConnections: number;
  blockedIPs: string[];
  lastAuditCheck: Date;
  policyViolations: PolicyViolation[];
}

export interface PolicyViolation {
  id: string;
  timestamp: Date;
  userId?: string;
  ipAddress?: string;
  action: string;
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ShardSecurityPolicyService extends EventEmitter {
  private policies: Map<string, ShardSecurityPolicy>;
  private quarantineStatus: Map<string, { quarantined: boolean; reason?: string; since?: Date }>;
  private securityStatus: Map<string, ShardSecurityStatus>;
  private violations: PolicyViolation[];

  constructor() {
    super();
    this.policies = new Map();
    this.quarantineStatus = new Map();
    this.securityStatus = new Map();
    this.violations = [];
  }

  createPolicy(policy: ShardSecurityPolicy): void {
    this.policies.set(policy.id, policy);
    this.initializeShardStatus(policy.shardId);
    console.log(`[ShardSecurity] Policy created: ${policy.name} for shard ${policy.shardId}`);
  }

  updatePolicy(policyId: string, updates: Partial<ShardSecurityPolicy>): void {
    const policy = this.policies.get(policyId);
    if (policy) {
      Object.assign(policy, updates);
      console.log(`[ShardSecurity] Policy updated: ${policyId}`);
    }
  }

  deletePolicy(policyId: string): void {
    this.policies.delete(policyId);
    console.log(`[ShardSecurity] Policy deleted: ${policyId}`);
  }

  getPolicy(shardId: string): ShardSecurityPolicy | undefined {
    return Array.from(this.policies.values()).find(p => p.shardId === shardId);
  }

  getAllPolicies(): ShardSecurityPolicy[] {
    return Array.from(this.policies.values());
  }

  private initializeShardStatus(shardId: string): void {
    this.securityStatus.set(shardId, {
      shardId,
      isHealthy: true,
      isQuarantined: false,
      currentLoad: 0,
      activeConnections: 0,
      blockedIPs: [],
      lastAuditCheck: new Date(),
      policyViolations: [],
    });
  }

  async checkAccess(
    shardId: string,
    options: { userId: string; role: string; ipAddress?: string }
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = this.getPolicy(shardId);
    if (!policy || !policy.enabled) {
      return { allowed: true };
    }

    const ac = policy.accessControl;

    if (ac.blockedUsers.includes(options.userId)) {
      await this.recordViolation(shardId, options.userId, options.ipAddress, 'user_blocked', policy.id);
      return { allowed: false, reason: 'User is blocked from this shard' };
    }

    if (ac.blockedRoles.includes(options.role)) {
      await this.recordViolation(shardId, options.userId, options.ipAddress, 'role_blocked', policy.id);
      return { allowed: false, reason: 'Role is not allowed on this shard' };
    }

    if (ac.allowedUsers.length > 0 && !ac.allowedUsers.includes(options.userId)) {
      return { allowed: false, reason: 'User not in whitelist' };
    }

    if (ac.allowedRoles.length > 0 && !ac.allowedRoles.includes(options.role)) {
      return { allowed: false, reason: 'Role not in whitelist' };
    }

    if (ac.ipBlacklist.length > 0 && options.ipAddress && ac.ipBlacklist.includes(options.ipAddress)) {
      await this.recordViolation(shardId, options.userId, options.ipAddress, 'ip_blocked', policy.id);
      return { allowed: false, reason: 'IP is blocked' };
    }

    if (ac.ipWhitelist.length > 0 && options.ipAddress && !ac.ipWhitelist.includes(options.ipAddress)) {
      return { allowed: false, reason: 'IP not in whitelist' };
    }

    return { allowed: true };
  }

  async checkRateLimit(shardId: string, userId: string, currentRate: number): Promise<{ allowed: boolean; reason?: string }> {
    const policy = this.getPolicy(shardId);
    if (!policy || !policy.rateLimiting.enabled) {
      return { allowed: true };
    }

    const rl = policy.rateLimiting;

    if (currentRate > rl.maxRequestsPerMinute) {
      await this.recordViolation(shardId, userId, undefined, 'rate_limit_exceeded', policy.id, 'high');
      return { allowed: false, reason: 'Rate limit exceeded' };
    }

    return { allowed: true };
  }

  async checkHealth(
    shardId: string,
    metrics: { errorRate: number; latencyMs: number; failedConnections: number }
  ): Promise<{ healthy: boolean; shouldQuarantine: boolean; reason?: string }> {
    const policy = this.getPolicy(shardId);
    const status = this.securityStatus.get(shardId);

    if (!policy || !policy.quarantineThreshold.enabled) {
      return { healthy: true, shouldQuarantine: false };
    }

    const qt = policy.quarantineThreshold;
    const reasons: string[] = [];

    if (metrics.errorRate * 100 > qt.errorRatePercent) {
      reasons.push(`Error rate ${metrics.errorRate * 100}% exceeds threshold ${qt.errorRatePercent}%`);
    }

    if (metrics.latencyMs > qt.latencyMs) {
      reasons.push(`Latency ${metrics.latencyMs}ms exceeds threshold ${qt.latencyMs}ms`);
    }

    if (metrics.failedConnections > qt.failedConnections) {
      reasons.push(`Failed connections ${metrics.failedConnections} exceeds threshold ${qt.failedConnections}`);
    }

    const shouldQuarantine = qt.autoQuarantine && reasons.length > 0;

    if (shouldQuarantine && !this.isQuarantined(shardId)) {
      await this.quarantineShard(shardId, reasons.join('; '));
    }

    if (status) {
      status.isHealthy = reasons.length === 0;
      status.currentLoad = metrics.errorRate;
    }

    return {
      healthy: reasons.length === 0,
      shouldQuarantine,
      reason: reasons.join('; ') || undefined,
    };
  }

  async quarantineShard(shardId: string, reason: string): Promise<void> {
    this.quarantineStatus.set(shardId, { quarantined: true, reason, since: new Date() });
    
    const status = this.securityStatus.get(shardId);
    if (status) {
      status.isQuarantined = true;
      status.quarantineReason = reason;
    }

    this.emit('shard:quarantined', { shardId, reason });
    console.log(`[ShardSecurity] Shard ${shardId} quarantined: ${reason}`);
  }

  async releaseQuarantine(shardId: string): Promise<void> {
    this.quarantineStatus.set(shardId, { quarantined: false });
    
    const status = this.securityStatus.get(shardId);
    if (status) {
      status.isQuarantined = false;
      status.quarantineReason = undefined;
    }

    this.emit('shard:released', { shardId });
    console.log(`[ShardSecurity] Shard ${shardId} released from quarantine`);
  }

  isQuarantined(shardId: string): boolean {
    return this.quarantineStatus.get(shardId)?.quarantined ?? false;
  }

  getSecurityStatus(shardId: string): ShardSecurityStatus | undefined {
    return this.securityStatus.get(shardId);
  }

  getAllSecurityStatuses(): ShardSecurityStatus[] {
    return Array.from(this.securityStatus.values());
  }

  private async recordViolation(
    shardId: string,
    userId: string | undefined,
    ipAddress: string | undefined,
    action: string,
    policyId: string,
    severity: PolicyViolation['severity'] = 'medium'
  ): Promise<void> {
    const violation: PolicyViolation = {
      id: this.generateId(),
      timestamp: new Date(),
      userId,
      ipAddress,
      action,
      policyId,
      severity,
    };

    this.violations.push(violation);

    const status = this.securityStatus.get(shardId);
    if (status) {
      status.policyViolations.push(violation);
    }

    this.emit('violation', violation);
  }

  getViolations(shardId?: string, since?: Date): PolicyViolation[] {
    return this.violations.filter(v => {
      if (shardId) {
        const status = this.securityStatus.get(shardId);
        if (!status || !status.policyViolations.some(pv => pv.id === v.id)) return false;
      }
      if (since && v.timestamp < since) return false;
      return true;
    });
  }

  private generateId(): string {
    return `violation_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
