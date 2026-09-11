import { getUserFromRequest } from './getUserFromRequest';

export enum UserCapability {
  TECHNICAL_COPILOT = 'TECHNICAL_COPILOT',
}

const CAPABILITY_ROLES: Record<string, UserCapability[]> = {
  ADMIN: [UserCapability.TECHNICAL_COPILOT],
  THREAD_ADMIN: [],
  STANDARD: [],
};

export function userHasCapability(
  user: { userId: string; role: string } | undefined,
  capability: UserCapability
): boolean {
  if (!user) return false;

  const roleCapabilities = CAPABILITY_ROLES[user.role] || [];
  if (roleCapabilities.includes(capability)) return true;

  return false;
}

export function requireCapability(capability: UserCapability) {
  return (req: any, res: any, next: any) => {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!userHasCapability(user, capability)) {
      console.log(
        `[Auth] User ${user.userId} denied ${capability} (role: ${user.role})`
      );
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    (req as any).authUser = user;
    next();
  };
}

export function extractUserFromRequest(req: any): { userId: string; role: string } | undefined {
  return getUserFromRequest(req);
}
