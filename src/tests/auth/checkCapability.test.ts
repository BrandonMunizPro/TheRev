import { userHasCapability, UserCapability } from '../../auth/checkCapability';

describe('checkCapability authorization', () => {
  describe('userHasCapability', () => {
    it('should deny access when user is undefined', () => {
      expect(userHasCapability(undefined, UserCapability.TECHNICAL_COPILOT)).toBe(
        false
      );
    });

    it('should deny access for an unauthenticated standard user', () => {
      expect(
        userHasCapability(
          { userId: 'user-1', role: 'STANDARD' },
          UserCapability.TECHNICAL_COPILOT
        )
      ).toBe(false);
    });

    it('should grant access for an admin user', () => {
      expect(
        userHasCapability(
          { userId: 'user-2', role: 'ADMIN' },
          UserCapability.TECHNICAL_COPILOT
        )
      ).toBe(true);
    });

    it('should deny access for unknown capabilities', () => {
      expect(
        userHasCapability({ userId: 'user-3', role: 'ADMIN' }, 'NOT_A_REAL_CAP' as UserCapability)
      ).toBe(false);
    });
  });
});