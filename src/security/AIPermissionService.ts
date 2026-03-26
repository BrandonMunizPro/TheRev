import { UserRole } from '../graphql/enums/UserRole';
import { ErrorHandler } from '../errors/ErrorHandler';

export enum AIPermission {
  CONTENT_GENERATION = 'content:generate',
  CONTENT_EDIT = 'content:edit',
  CONTENT_DELETE = 'content:delete',
  AVATAR_CREATE = 'avatar:create',
  AVATAR_EDIT = 'avatar:edit',
  AVATAR_DELETE = 'avatar:delete',
  PROFILE_EDIT = 'profile:edit',
  BROWSER_AUTOMATION = 'browser:automation',
  BULK_OPERATIONS = 'bulk:operations',
  DATA_EXPORT = 'data:export',
  AI_ACCOUNT_MANAGE = 'ai:account:manage',
  AUDIT_VIEW = 'audit:view',
}

export interface UserAIPermissions {
  userId: string;
  role: UserRole;
  permissions: Set<AIPermission>;
  rateLimitTier: 'free' | 'premium' | 'enterprise';
  dailyTokenLimit: number;
  monthlyTaskLimit: number;
  canUseBrowserAutomation: boolean;
  canBulkOperate: boolean;
  canManageAccounts: boolean;
  expiresAt?: Date;
}

export interface AIPermissionRule {
  id: string;
  name: string;
  description: string;
  permissions: AIPermission[];
  roles: UserRole[];
  rateLimitTier: 'free' | 'premium' | 'enterprise';
  dailyTokenLimit: number;
  monthlyTaskLimit: number;
  canUseBrowserAutomation: boolean;
  canBulkOperate: boolean;
  canManageAccounts: boolean;
}

export const DEFAULT_PERMISSION_RULES: AIPermissionRule[] = [
  {
    id: 'standard',
    name: 'Standard Tier',
    description: 'Basic permissions for standard users',
    permissions: [
      AIPermission.CONTENT_GENERATION,
      AIPermission.CONTENT_EDIT,
      AIPermission.AVATAR_CREATE,
      AIPermission.PROFILE_EDIT,
    ],
    roles: [UserRole.STANDARD],
    rateLimitTier: 'free',
    dailyTokenLimit: 100000,
    monthlyTaskLimit: 500,
    canUseBrowserAutomation: false,
    canBulkOperate: false,
    canManageAccounts: false,
  },
  {
    id: 'thread_admin',
    name: 'Thread Admin',
    description: 'Thread-level admin permissions',
    permissions: [
      AIPermission.CONTENT_GENERATION,
      AIPermission.CONTENT_EDIT,
      AIPermission.CONTENT_DELETE,
      AIPermission.AVATAR_CREATE,
      AIPermission.PROFILE_EDIT,
      AIPermission.BROWSER_AUTOMATION,
    ],
    roles: [UserRole.THREAD_ADMIN],
    rateLimitTier: 'premium',
    dailyTokenLimit: 500000,
    monthlyTaskLimit: 5000,
    canUseBrowserAutomation: true,
    canBulkOperate: false,
    canManageAccounts: false,
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full permissions for admins',
    permissions: Object.values(AIPermission),
    roles: [UserRole.ADMIN],
    rateLimitTier: 'enterprise',
    dailyTokenLimit: Number.MAX_SAFE_INTEGER,
    monthlyTaskLimit: Number.MAX_SAFE_INTEGER,
    canUseBrowserAutomation: true,
    canBulkOperate: true,
    canManageAccounts: true,
  },
];

export class AIPermissionService {
  private permissionRules: Map<UserRole, AIPermissionRule>;
  private userPermissions: Map<string, UserAIPermissions>;
  private usageTracker: Map<
    string,
    { dailyTokens: number; monthlyTasks: number; lastReset: Date }
  >;

  constructor(rules: AIPermissionRule[] = DEFAULT_PERMISSION_RULES) {
    this.permissionRules = new Map();
    this.userPermissions = new Map();
    this.usageTracker = new Map();

    for (const rule of rules) {
      for (const role of rule.roles) {
        this.permissionRules.set(role, rule);
      }
    }
  }

  async getUserPermissions(
    userId: string,
    userRole: UserRole
  ): Promise<UserAIPermissions> {
    const cached = this.userPermissions.get(userId);
    if (cached && (!cached.expiresAt || cached.expiresAt > new Date())) {
      return cached;
    }

    const rule =
      this.permissionRules.get(userRole) ||
      this.permissionRules.get(UserRole.STANDARD)!;
    const permissions = new Set(rule.permissions);

    const userPerms: UserAIPermissions = {
      userId,
      role: userRole,
      permissions,
      rateLimitTier: rule.rateLimitTier,
      dailyTokenLimit: rule.dailyTokenLimit,
      monthlyTaskLimit: rule.monthlyTaskLimit,
      canUseBrowserAutomation: rule.canUseBrowserAutomation,
      canBulkOperate: rule.canBulkOperate,
      canManageAccounts: rule.canManageAccounts,
    };

    this.userPermissions.set(userId, userPerms);
    return userPerms;
  }

  async checkPermission(
    userId: string,
    userRole: UserRole,
    permission: AIPermission
  ): Promise<boolean> {
    const perms = await this.getUserPermissions(userId, userRole);
    return perms.permissions.has(permission);
  }

  async requirePermission(
    userId: string,
    userRole: UserRole,
    permission: AIPermission
  ): Promise<void> {
    const hasPermission = await this.checkPermission(
      userId,
      userRole,
      permission
    );
    if (!hasPermission) {
      throw ErrorHandler.insufficientPermissions(permission, 'AI feature');
    }
  }

  async checkRateLimit(
    userId: string,
    tokensToUse: number,
    tasksToAdd: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const usage = this.getOrInitUsage(userId);

    const perms = this.userPermissions.get(userId);
    if (!perms) return { allowed: true };

    if (usage.dailyTokens + tokensToUse > perms.dailyTokenLimit) {
      return { allowed: false, reason: 'Daily token limit exceeded' };
    }

    if (usage.monthlyTasks + tasksToAdd > perms.monthlyTaskLimit) {
      return { allowed: false, reason: 'Monthly task limit exceeded' };
    }

    return { allowed: true };
  }

  async consumeRateLimit(
    userId: string,
    tokensUsed: number,
    tasksAdded: number = 1
  ): Promise<void> {
    const usage = this.getOrInitUsage(userId);
    usage.dailyTokens += tokensUsed;
    usage.monthlyTasks += tasksAdded;
    this.usageTracker.set(userId, usage);
  }

  private getOrInitUsage(userId: string): {
    dailyTokens: number;
    monthlyTasks: number;
    lastReset: Date;
  } {
    const now = new Date();
    let usage = this.usageTracker.get(userId);

    if (!usage) {
      usage = { dailyTokens: 0, monthlyTasks: 0, lastReset: now };
    } else {
      const hoursSinceReset =
        (now.getTime() - usage.lastReset.getTime()) / (1000 * 60 * 60);
      if (hoursSinceReset >= 24) {
        usage = {
          dailyTokens: 0,
          monthlyTasks: usage.monthlyTasks,
          lastReset: now,
        };
      }
    }

    return usage;
  }

  async getUsageStats(userId: string): Promise<{
    dailyTokens: number;
    monthlyTasks: number;
    limits: { daily: number; monthly: number };
  }> {
    const usage = this.getOrInitUsage(userId);
    const perms = this.userPermissions.get(userId);

    return {
      dailyTokens: usage.dailyTokens,
      monthlyTasks: usage.monthlyTasks,
      limits: {
        daily: perms?.dailyTokenLimit ?? 100000,
        monthly: perms?.monthlyTaskLimit ?? 500,
      },
    };
  }

  async grantTemporaryPermission(
    userId: string,
    permission: AIPermission,
    expiresAt: Date
  ): Promise<void> {
    let perms = this.userPermissions.get(userId);
    if (!perms) {
      const rule = this.permissionRules.get(UserRole.STANDARD)!;
      perms = {
        userId,
        role: UserRole.STANDARD,
        permissions: new Set(rule.permissions),
        rateLimitTier: rule.rateLimitTier,
        dailyTokenLimit: rule.dailyTokenLimit,
        monthlyTaskLimit: rule.monthlyTaskLimit,
        canUseBrowserAutomation: rule.canUseBrowserAutomation,
        canBulkOperate: rule.canBulkOperate,
        canManageAccounts: rule.canManageAccounts,
        expiresAt,
      };
    }

    perms.permissions.add(permission);
    perms.expiresAt = expiresAt;
    this.userPermissions.set(userId, perms);
  }

  async revokePermission(
    userId: string,
    permission: AIPermission
  ): Promise<void> {
    const perms = this.userPermissions.get(userId);
    if (perms) {
      perms.permissions.delete(permission);
      this.userPermissions.set(userId, perms);
    }
  }

  async setUserRole(
    userId: string,
    role: UserRole
  ): Promise<UserAIPermissions> {
    return this.getUserPermissions(userId, role);
  }
}
