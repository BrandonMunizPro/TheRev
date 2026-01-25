import { ThreadAdminResolver } from '../../resolvers/ThreadPermissions';
import { ThreadAdminModel } from '../../models/threadAdmin.model';
import {
  GrantThreadAdminInput,
  RevokeThreadAdminInput,
} from '../../resolvers/ThreadPermissions';
import { ThreadQueryInput } from '../../resolvers/Thread';
import { GraphQLContext } from '../../graphql/context';

jest.mock('../../models/threadAdmin.model');

describe('ThreadAdminResolver', () => {
  let threadAdminResolver: ThreadAdminResolver;
  let mockThreadAdminModel: jest.Mocked<ThreadAdminModel>;
  let mockContext: GraphQLContext;

  beforeEach(() => {
    mockThreadAdminModel =
      new ThreadAdminModel() as jest.Mocked<ThreadAdminModel>;
    threadAdminResolver = new ThreadAdminResolver();
    (threadAdminResolver as any).model = mockThreadAdminModel;

    mockContext = {
      user: {
        userId: 'testUser1',
        email: 'test@example.com',
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('grantThreadAdmin', () => {
    it('should throw error when user is not authenticated', async () => {
      const data: GrantThreadAdminInput = {
        threadId: 'thread1',
        suggestedUserId: 'user1',
      };
      const unauthenticatedContext = { user: null };

      await expect(
        threadAdminResolver.grantThreadAdmin(data, unauthenticatedContext)
      ).rejects.toThrow('Authentication required');
    });

    it('should grant thread admin successfully', async () => {
      const data: GrantThreadAdminInput = {
        threadId: 'thread1',
        suggestedUserId: 'targetUser1',
      };
      const grantedAdmin = {
        id: 'admin1',
        userId: 'targetUser1',
        threadId: 'thread1',
        grantedById: 'testUser1',
      };

      mockThreadAdminModel.grantAdmin.mockResolvedValue(grantedAdmin);

      const result = await threadAdminResolver.grantThreadAdmin(
        data,
        mockContext
      );

      expect(mockThreadAdminModel.grantAdmin).toHaveBeenCalledWith(
        data,
        'testUser1'
      );
      expect(result).toEqual(grantedAdmin);
    });

    it('should handle errors from model', async () => {
      const data: GrantThreadAdminInput = {
        threadId: 'thread1',
        suggestedUserId: 'user1',
      };
      const error = new Error('Permission denied');

      mockThreadAdminModel.grantAdmin.mockRejectedValue(error);

      await expect(
        threadAdminResolver.grantThreadAdmin(data, mockContext)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('revokeThreadAdmin', () => {
    it('should throw error when user is not authenticated', async () => {
      const data: RevokeThreadAdminInput = {
        threadId: 'thread1',
        authorId: 'user1',
      };
      const unauthenticatedContext = { user: null };

      await expect(
        threadAdminResolver.revokeThreadAdmin(data, unauthenticatedContext)
      ).rejects.toThrow('Authentication required');
    });

    it('should revoke thread admin successfully', async () => {
      const data: RevokeThreadAdminInput = {
        threadId: 'thread1',
        authorId: 'targetUser1',
      };

      mockThreadAdminModel.revokeAdmin.mockResolvedValue(undefined);

      const result = await threadAdminResolver.revokeThreadAdmin(
        data,
        mockContext
      );

      expect(mockThreadAdminModel.revokeAdmin).toHaveBeenCalledWith(
        data,
        'testUser1'
      );
      expect(result).toBe(true);
    });

    it('should handle errors from model', async () => {
      const data: RevokeThreadAdminInput = {
        threadId: 'thread1',
        authorId: 'user1',
      };
      const error = new Error('Permission denied');

      mockThreadAdminModel.revokeAdmin.mockRejectedValue(error);

      await expect(
        threadAdminResolver.revokeThreadAdmin(data, mockContext)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('threadAdmins', () => {
    it('should throw error when user is not authenticated', async () => {
      const data: ThreadQueryInput = { id: 'thread1' };
      const unauthenticatedContext = { user: null };

      await expect(
        threadAdminResolver.threadAdmins(data, unauthenticatedContext)
      ).rejects.toThrow('Authentication required');
    });

    it('should return list of thread admins', async () => {
      const data: ThreadQueryInput = { id: 'thread1' };
      const adminList = [
        { id: 'admin1', userId: 'user1', threadId: 'thread1' },
        { id: 'admin2', userId: 'user2', threadId: 'thread1' },
      ];

      mockThreadAdminModel.listAdminsForThread.mockResolvedValue(adminList);

      const result = await threadAdminResolver.threadAdmins(data, mockContext);

      expect(mockThreadAdminModel.listAdminsForThread).toHaveBeenCalledWith(
        data,
        'testUser1'
      );
      expect(result).toEqual(adminList);
    });

    it('should handle errors from model', async () => {
      const data: ThreadQueryInput = { id: 'thread1' };
      const error = new Error('Permission denied');

      mockThreadAdminModel.listAdminsForThread.mockRejectedValue(error);

      await expect(
        threadAdminResolver.threadAdmins(data, mockContext)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('myAdminThreads', () => {
    it('should throw error when user is not authenticated', async () => {
      const unauthenticatedContext = { user: null };

      await expect(
        threadAdminResolver.myAdminThreads(unauthenticatedContext)
      ).rejects.toThrow('Authentication required');
    });

    it('should return list of threads where user is admin', async () => {
      const threadList = [
        { id: 'admin1', userId: 'testUser1', threadId: 'thread1' },
        { id: 'admin2', userId: 'testUser1', threadId: 'thread2' },
      ];

      mockThreadAdminModel.listThreadsForUser.mockResolvedValue(threadList);

      const result = await threadAdminResolver.myAdminThreads(mockContext);

      expect(mockThreadAdminModel.listThreadsForUser).toHaveBeenCalledWith(
        'testUser1'
      );
      expect(result).toEqual(threadList);
    });

    it('should handle errors from model', async () => {
      const error = new Error('User not found');

      mockThreadAdminModel.listThreadsForUser.mockRejectedValue(error);

      await expect(
        threadAdminResolver.myAdminThreads(mockContext)
      ).rejects.toThrow('User not found');
    });
  });
});
