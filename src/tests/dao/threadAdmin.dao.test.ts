import { ThreadAdminDao } from '../../dao/threadAdmin.dao';
import { AppDataSource } from '../../data-source';

jest.mock('../../data-source');
const mockAppDataSource = AppDataSource as jest.Mocked<typeof AppDataSource>;

jest.mock('../../entities/ThreadAdmin', () => ({
  ThreadAdmin: class {}
}));

describe('ThreadAdminDao', () => {
  let threadAdminDao: ThreadAdminDao;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    threadAdminDao = new ThreadAdminDao();
    mockQuery = jest.fn();
    mockAppDataSource.query = mockQuery;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isThreadAdmin', () => {
    it('should return thread admin result when user is admin', async () => {
      const userId = 'user1';
      const threadId = 'thread1';
      const expectedResult = [{ id: '1', userId, threadId }];

      mockQuery.mockResolvedValue(expectedResult);

      const result = await threadAdminDao.isThreadAdmin(userId, threadId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1'),
        [userId, threadId]
      );
      expect(result).toEqual(expectedResult);
    });

    it('should return empty result when user is not admin', async () => {
      const userId = 'user1';
      const threadId = 'thread1';
      const expectedResult: unknown[] = [];

      mockQuery.mockResolvedValue(expectedResult);

      const result = await threadAdminDao.isThreadAdmin(userId, threadId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1'),
        [userId, threadId]
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle database errors', async () => {
      const userId = 'user1';
      const threadId = 'thread1';
      const error = new Error('Database connection failed');

      mockQuery.mockRejectedValue(error);

      await expect(threadAdminDao.isThreadAdmin(userId, threadId)).rejects.toThrow(error);
    });
  });

  describe('grantOrRestoreThreadAdmin', () => {
    it('should grant new thread admin', async () => {
      const userId = 'user1';
      const threadId = 'thread1';
      const grantedById = 'admin1';
      const expectedResult = {
        id: 'admin-1',
        userId,
        threadId,
        grantedById,
        createdAt: new Date(),
        revokedAt: null
      };

      mockQuery.mockResolvedValue([expectedResult]);

      const result = await threadAdminDao.grantOrRestoreThreadAdmin(userId, threadId, grantedById);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO thread_admin'),
        [userId, threadId, grantedById]
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('revokeThreadAdmin', () => {
    it('should revoke thread admin successfully', async () => {
      const userId = 'user1';
      const threadId = 'thread1';
      const expectedResult = {
        id: 'admin-1',
        userId,
        threadId,
        revokedAt: new Date()
      };

      mockQuery.mockResolvedValue([expectedResult]);

      const result = await threadAdminDao.revokeThreadAdmin(userId, threadId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE thread_admin'),
        [userId, threadId]
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('listAdminsForThread', () => {
    it('should return list of admins for thread', async () => {
      const threadId = 'thread1';
      const expectedResult = [
        { id: 'admin-1', userId: 'user1', threadId },
        { id: 'admin-2', userId: 'user2', threadId }
      ];

      mockQuery.mockResolvedValue(expectedResult);

      const result = await threadAdminDao.listAdminsForThread(threadId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE "threadId" = $1'),
        [threadId]
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('listThreadsForUser', () => {
    it('should return list of threads where user is admin', async () => {
      const userId = 'user1';
      const expectedResult = [
        { id: 'admin-1', userId, threadId: 'thread1' },
        { id: 'admin-2', userId, threadId: 'thread2' }
      ];

      mockQuery.mockResolvedValue(expectedResult);

      const result = await threadAdminDao.listThreadsForUser(userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE "userId" = $1'),
        [userId]
      );
      expect(result).toEqual(expectedResult);
    });
  });
});