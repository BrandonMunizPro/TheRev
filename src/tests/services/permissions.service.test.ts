import { PermissionsService } from '../../services/permissionsService';
import { ThreadAdminDao } from '../../dao/threadAdmin.dao';
import { UsersDao } from '../../dao/users.dao';
import { ThreadsDao } from '../../dao/threads.dao';
import { UserRole } from '../../graphql/enums/UserRole';

jest.mock('../../dao/threadAdmin.dao');
jest.mock('../../dao/users.dao');
jest.mock('../../dao/threads.dao');

describe('PermissionsService', () => {
  let permissionsService: PermissionsService;
  let mockThreadAdminDao: jest.Mocked<ThreadAdminDao>;
  let mockUsersDao: jest.Mocked<UsersDao>;
  let mockThreadsDao: jest.Mocked<ThreadsDao>;

  beforeEach(() => {
    mockThreadAdminDao = new ThreadAdminDao() as jest.Mocked<ThreadAdminDao>;
    mockUsersDao = new UsersDao() as jest.Mocked<UsersDao>;
    mockThreadsDao = new ThreadsDao() as jest.Mocked<ThreadsDao>;

    permissionsService = new PermissionsService();
    (permissionsService as any).threadAdminDao = mockThreadAdminDao;
    (permissionsService as any).usersDao = mockUsersDao;
    (permissionsService as any).threadsDao = mockThreadsDao;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkThreadPermissions', () => {
    const threadId = 'thread1';
    const userId = 'user1';
    const action = 'perform action';

    it('should throw error when thread not found', async () => {
      mockThreadsDao.findById.mockResolvedValue(null);

      await expect(
        permissionsService.checkThreadPermissions(threadId, userId, action)
      ).rejects.toThrow('Thread not found: thread1');

      expect(mockThreadsDao.findById).toHaveBeenCalledWith(threadId);
    });

    it('should throw error when user not found', async () => {
      const thread = { id: threadId, author: { id: 'author1' } } as any;
      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(null);

      await expect(
        permissionsService.checkThreadPermissions(threadId, userId, action)
      ).rejects.toThrow('User not found: user1');

      expect(mockUsersDao.findById).toHaveBeenCalledWith(userId);
    });

    it('should throw error when user has revoked admin privileges', async () => {
      const thread = { id: threadId, author: { id: 'author1' } } as any;
      const user = { id: userId, role: UserRole.STANDARD } as any;
      const revokedAdmin = { revokedAt: new Date() } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(revokedAdmin);

      await expect(
        permissionsService.checkThreadPermissions(threadId, userId, action)
      ).rejects.toThrow(
        'Your privilege as an admin on this thread was revoked'
      );
    });

    it('should throw error when user has no permissions', async () => {
      const thread = { id: threadId, author: { id: 'differentUser' } } as any;
      const user = { id: userId, role: UserRole.STANDARD } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      await expect(
        permissionsService.checkThreadPermissions(threadId, userId, action)
      ).rejects.toThrow(`You don't have permission to ${action} this Thread`);
    });

    it('should return permission result when user is author', async () => {
      const thread = { id: threadId, author: { id: userId } } as any;
      const user = { id: userId, role: UserRole.STANDARD } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      const result = await permissionsService.checkThreadPermissions(
        threadId,
        userId,
        action
      );

      expect(result).toEqual({
        thread,
        user,
        isAuthor: true,
        isGlobalAdmin: false,
        isThreadAdmin: null,
      });
    });

    it('should return permission result when user is global admin', async () => {
      const thread = { id: threadId, author: { id: 'differentUser' } } as any;
      const user = { id: userId, role: UserRole.ADMIN } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      const result = await permissionsService.checkThreadPermissions(
        threadId,
        userId,
        action
      );

      expect(result).toEqual({
        thread,
        user,
        isAuthor: false,
        isGlobalAdmin: true,
        isThreadAdmin: null,
      });
    });

    it('should return permission result when user is thread admin', async () => {
      const thread = { id: threadId, author: { id: 'differentUser' } } as any;
      const user = { id: userId, role: UserRole.STANDARD } as any;
      const threadAdmin = { revokedAt: null } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(threadAdmin);

      const result = await permissionsService.checkThreadPermissions(
        threadId,
        userId,
        action
      );

      expect(result).toEqual({
        thread,
        user,
        isAuthor: false,
        isGlobalAdmin: false,
        isThreadAdmin: threadAdmin,
      });
    });
  });

  describe('checkUserExists', () => {
    it('should throw error when user not found', async () => {
      const userId = 'user1';
      mockUsersDao.findById.mockResolvedValue(null);

      await expect(permissionsService.checkUserExists(userId)).rejects.toThrow(
        'User not found: user1'
      );

      expect(mockUsersDao.findById).toHaveBeenCalledWith(userId);
    });

    it('should return user when found', async () => {
      const userId = 'user1';
      const user = { id: userId, email: 'test@example.com' };

      mockUsersDao.findById.mockResolvedValue(user);

      const result = await permissionsService.checkUserExists(userId);

      expect(result).toEqual(user);
    });
  });

  describe('checkGlobalAdmin', () => {
    it('should return true when user is global admin', async () => {
      const userId = 'admin1';
      const adminUser = { id: userId, role: UserRole.ADMIN } as any;

      mockUsersDao.findById.mockResolvedValue(adminUser);

      const result = await permissionsService.checkGlobalAdmin(userId);

      expect(result).toBe(true);
    });

    it('should return false when user is not global admin', async () => {
      const userId = 'user1';
      const regularUser = { id: userId, role: UserRole.STANDARD } as any;

      mockUsersDao.findById.mockResolvedValue(regularUser);

      const result = await permissionsService.checkGlobalAdmin(userId);

      expect(result).toBe(false);
    });
  });

  describe('checkAdminOrThreadAdmin', () => {
    it('should return true when user is global admin', async () => {
      const userId = 'admin1';
      const adminUser = { id: userId, role: UserRole.ADMIN } as any;

      mockUsersDao.findById.mockResolvedValue(adminUser);

      const result = await permissionsService.checkAdminOrThreadAdmin(userId);

      expect(result).toBe(true);
    });

    it('should return true when user is thread admin', async () => {
      const userId = 'threadAdmin1';
      const threadAdminUser = {
        id: userId,
        role: UserRole.THREAD_ADMIN,
      } as any;

      mockUsersDao.findById.mockResolvedValue(threadAdminUser);

      const result = await permissionsService.checkAdminOrThreadAdmin(userId);

      expect(result).toBe(true);
    });

    it('should return false when user is regular user', async () => {
      const userId = 'user1';
      const regularUser = { id: userId, role: UserRole.STANDARD } as any;

      mockUsersDao.findById.mockResolvedValue(regularUser);

      const result = await permissionsService.checkAdminOrThreadAdmin(userId);

      expect(result).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user is author', () => {
      const result = permissionsService.hasPermission(true, false, null);
      expect(result).toBe(true);
    });

    it('should return true when user is global admin', () => {
      const result = permissionsService.hasPermission(false, true, null);
      expect(result).toBe(true);
    });

    it('should return true when user is thread admin with non-revoked privileges', () => {
      const threadAdmin = { revokedAt: null };
      const result = permissionsService.hasPermission(
        false,
        false,
        threadAdmin
      );
      expect(result).toBe(true);
    });

    it('should return false when user has no permissions', () => {
      const result = permissionsService.hasPermission(false, false, null);
      expect(result).toBe(false);
    });

    it('should return false when thread admin privileges are revoked', () => {
      const revokedAdmin = { revokedAt: new Date() };
      const result = permissionsService.hasPermission(
        false,
        false,
        revokedAdmin
      );
      expect(result).toBe(false);
    });

    it('should return true when user is both author and admin', () => {
      const threadAdmin = { revokedAt: null };
      const result = permissionsService.hasPermission(true, true, threadAdmin);
      expect(result).toBe(true);
    });

    it('should handle thread admin with undefined revokedAt', () => {
      const threadAdmin = { revokedAt: undefined };
      const result = permissionsService.hasPermission(
        false,
        false,
        threadAdmin
      );
      expect(result).toBe(true);
    });

    it('should handle thread admin with null revokedAt', () => {
      const threadAdmin = { revokedAt: null };
      const result = permissionsService.hasPermission(
        false,
        false,
        threadAdmin
      );
      expect(result).toBe(true);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle database errors in checkThreadPermissions', async () => {
      mockThreadsDao.findById.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        permissionsService.checkThreadPermissions('thread1', 'user1', 'action')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle malformed thread admin data', async () => {
      const thread = { id: 'thread1', author: { id: 'differentUser' } } as any;
      const user = { id: 'user1', role: UserRole.STANDARD } as any;
      const malformedAdmin = { revokedAt: new Date() } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(malformedAdmin);

      await expect(
        permissionsService.checkThreadPermissions('thread1', 'user1', 'action')
      ).rejects.toThrow(
        'Your privilege as an admin on this thread was revoked'
      );
    });

    it('should handle empty action string', async () => {
      const thread = { id: 'thread1', author: { id: 'user1' } } as any;
      const user = { id: 'user1', role: UserRole.STANDARD } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      const result = await permissionsService.checkThreadPermissions(
        'thread1',
        'user1',
        ''
      );
      expect(result.isAuthor).toBe(true);
    });

    it('should handle very long action strings', async () => {
      const thread = { id: 'thread1', author: { id: 'differentUser' } } as any;
      const user = { id: 'user1', role: UserRole.STANDARD } as any;
      const longAction = 'a'.repeat(1000);

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      await expect(
        permissionsService.checkThreadPermissions(
          'thread1',
          'user1',
          longAction
        )
      ).rejects.toThrow(
        `You don't have permission to ${longAction} this Thread`
      );
    });

    it('should handle null thread admin result', async () => {
      const thread = { id: 'thread1', author: { id: 'differentUser' } } as any;
      const user = { id: 'user1', role: UserRole.STANDARD } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      await expect(
        permissionsService.checkThreadPermissions('thread1', 'user1', 'action')
      ).rejects.toThrow("You don't have permission to action this Thread");
    });
  });

  describe('concurrent permission checks', () => {
    it('should handle multiple concurrent permission checks', async () => {
      const thread = { id: 'thread1', author: { id: 'user1' } } as any;
      const user = { id: 'user1', role: UserRole.STANDARD } as any;

      mockThreadsDao.findById.mockResolvedValue(thread);
      mockUsersDao.findById.mockResolvedValue(user);
      mockThreadAdminDao.isThreadAdmin.mockResolvedValue(null);

      const promises = Array(10)
        .fill(null)
        .map((_, i) =>
          permissionsService.checkThreadPermissions(
            'thread1',
            'user1',
            `action ${i}`
          )
        );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.isAuthor).toBe(true);
      });
    });
  });
});
