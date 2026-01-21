import { ThreadAdminModel } from '../../models/threadAdmin.model';
import { ThreadAdminDao } from '../../dao/threadAdmin.dao';
import { PermissionsService } from '../../services/permissionsService';
import { UsersDao } from '../../dao/users.dao';
import { GrantThreadAdminInput, RevokeThreadAdminInput } from '../../resolvers/ThreadPermissions';
import { ThreadQueryInput } from '../../resolvers/Thread';

jest.mock('../../dao/threadAdmin.dao');
jest.mock('../../dao/users.dao');
jest.mock('../../dao/threads.dao');
jest.mock('../../services/permissionsService');

describe('ThreadAdminModel', () => {
  let threadAdminModel: ThreadAdminModel;
  let mockThreadAdminDao: jest.Mocked<ThreadAdminDao>;
  let mockPermissionsService: jest.Mocked<PermissionsService>;
  let mockUsersDao: jest.Mocked<UsersDao>;

  beforeEach(() => {
    mockThreadAdminDao = new ThreadAdminDao() as jest.Mocked<ThreadAdminDao>;
    mockPermissionsService = new PermissionsService() as jest.Mocked<PermissionsService>;
    mockUsersDao = new UsersDao() as jest.Mocked<UsersDao>;
    
    threadAdminModel = new ThreadAdminModel();
    (threadAdminModel as any).dao = mockThreadAdminDao;
    (threadAdminModel as any).permissionsService = mockPermissionsService;
    (threadAdminModel as any).usersDao = mockUsersDao;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('grantAdmin', () => {
    it('should throw error when threadId is missing', async () => {
      const data: GrantThreadAdminInput = {
        threadId: '',
        suggestedUserId: 'user1'
      };

      await expect(threadAdminModel.grantAdmin(data, 'requester1'))
        .rejects.toThrow('Please provide ThreadId and suggested UserId');
    });

    it('should throw error when suggestedUserId is missing', async () => {
      const data: GrantThreadAdminInput = {
        threadId: 'thread1',
        suggestedUserId: ''
      };

      await expect(threadAdminModel.grantAdmin(data, 'requester1'))
        .rejects.toThrow('Please provide ThreadId and suggested UserId');
    });

    it('should grant admin permissions successfully', async () => {
      const data: GrantThreadAdminInput = {
        threadId: 'thread1',
        suggestedUserId: 'targetUser1'
      };
      const userId = 'requester1';
      const suggestedUser = { id: 'targetUser1', email: 'target@example.com' };
      const grantedAdmin = {
        id: 'admin1',
        userId: 'targetUser1',
        threadId: 'thread1',
        grantedById: userId
      };

      mockPermissionsService.checkThreadPermissions.mockResolvedValue({} as any);
      mockPermissionsService.checkUserExists.mockResolvedValue(suggestedUser);
      mockThreadAdminDao.grantOrRestoreThreadAdmin.mockResolvedValue(grantedAdmin);

      const result = await threadAdminModel.grantAdmin(data, userId);

      expect(mockPermissionsService.checkThreadPermissions).toHaveBeenCalledWith('thread1', userId, 'grant admin privilege');
      expect(mockPermissionsService.checkUserExists).toHaveBeenCalledWith('targetUser1');
      expect(mockThreadAdminDao.grantOrRestoreThreadAdmin).toHaveBeenCalledWith('targetUser1', 'thread1', userId);
      expect(result).toEqual(grantedAdmin);
    });

    it('should throw error when suggested user not found', async () => {
      const data: GrantThreadAdminInput = {
        threadId: 'thread1',
        suggestedUserId: 'nonexistentUser'
      };
      const userId = 'requester1';

      mockPermissionsService.checkThreadPermissions.mockResolvedValue({} as any);
      mockPermissionsService.checkUserExists.mockRejectedValue(new Error('User not found'));

      await expect(threadAdminModel.grantAdmin(data, userId))
        .rejects.toThrow('User not found');
    });
  });

  describe('revokeAdmin', () => {
    it('should throw error when threadId is missing', async () => {
      const data: RevokeThreadAdminInput = {
        threadId: '',
        authorId: 'user1'
      };

      await expect(threadAdminModel.revokeAdmin(data, 'requester1'))
        .rejects.toThrow('Thread ID is required');
    });

    it('should throw error when authorId is missing', async () => {
      const data: RevokeThreadAdminInput = {
        threadId: 'thread1',
        authorId: ''
      };

      await expect(threadAdminModel.revokeAdmin(data, 'requester1'))
        .rejects.toThrow('Author ID is required to revoke admin');
    });

    it('should revoke admin permissions successfully', async () => {
      const data: RevokeThreadAdminInput = {
        threadId: 'thread1',
        authorId: 'targetUser1'
      };
      const userId = 'requester1';
      const revokedAdmin = {
        id: 'admin1',
        userId: 'targetUser1',
        threadId: 'thread1',
        revokedAt: new Date()
      };

      mockPermissionsService.checkThreadPermissions.mockResolvedValue({} as any);
      mockThreadAdminDao.revokeThreadAdmin.mockResolvedValue(revokedAdmin);

      const result = await threadAdminModel.revokeAdmin(data, userId);

      expect(mockPermissionsService.checkThreadPermissions).toHaveBeenCalledWith('thread1', userId, 'revoke admin privilege');
      expect(mockThreadAdminDao.revokeThreadAdmin).toHaveBeenCalledWith('targetUser1', 'thread1');
      expect(result).toEqual(revokedAdmin);
    });
  });

  describe('listAdminsForThread', () => {
    it('should throw error when threadId is missing', async () => {
      const data: ThreadQueryInput = {};

      await expect(threadAdminModel.listAdminsForThread(data, 'userId1'))
        .rejects.toThrow('Thread ID is required');
    });

    it('should return list of admins for thread', async () => {
      const data: ThreadQueryInput = { id: 'thread1' };
      const userId = 'requester1';
      const adminList = [
        { id: 'admin1', userId: 'user1', threadId: 'thread1' },
        { id: 'admin2', userId: 'user2', threadId: 'thread1' }
      ];

      mockPermissionsService.checkThreadPermissions.mockResolvedValue({} as any);
      mockThreadAdminDao.listAdminsForThread.mockResolvedValue(adminList);

      const result = await threadAdminModel.listAdminsForThread(data, userId);

      expect(mockPermissionsService.checkThreadPermissions).toHaveBeenCalledWith('thread1', userId, 'view admins for this Thread');
      expect(mockThreadAdminDao.listAdminsForThread).toHaveBeenCalledWith('thread1');
      expect(result).toEqual(adminList);
    });
  });

  describe('listThreadsForUser', () => {
    it('should return list of threads where user is admin', async () => {
      const userId = 'user1';
      const threadList = [
        { id: 'admin1', userId, threadId: 'thread1' },
        { id: 'admin2', userId, threadId: 'thread2' }
      ];

      mockPermissionsService.checkUserExists.mockResolvedValue({} as any);
      mockThreadAdminDao.listThreadsForUser.mockResolvedValue(threadList);

      const result = await threadAdminModel.listThreadsForUser(userId);

      expect(mockPermissionsService.checkUserExists).toHaveBeenCalledWith(userId);
      expect(mockThreadAdminDao.listThreadsForUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual(threadList);
    });

    it('should throw error when user not found', async () => {
      const userId = 'nonexistentUser';

      mockPermissionsService.checkUserExists.mockRejectedValue(new Error('User not found'));

      await expect(threadAdminModel.listThreadsForUser(userId))
        .rejects.toThrow('User not found');
    });
  });
});