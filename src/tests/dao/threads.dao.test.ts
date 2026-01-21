import { ThreadsDao } from '../../dao/threads.dao';
import { AppDataSource } from '../../data-source';
import { Thread } from '../../entities/Thread';

jest.mock('../../data-source');
const mockAppDataSource = AppDataSource as jest.Mocked<typeof AppDataSource>;

describe('ThreadsDao', () => {
  let threadsDao: ThreadsDao;
  let mockQuery: jest.Mock;
  let mockRepository: any;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockRepository = {
      delete: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    mockAppDataSource.query = mockQuery;
    mockAppDataSource.getRepository = jest.fn().mockReturnValue(mockRepository);
    threadsDao = new ThreadsDao();
  });


  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return thread when found', async () => {
      const threadId = 'thread1';
      const expectedThread = {
        id: threadId,
        title: 'Test Thread',
        content: 'Test content',
        author: { id: 'user1', username: 'testuser' }
      };

      mockRepository.findOne.mockResolvedValue(expectedThread);

      const result = await threadsDao.findById(threadId);

      expect(mockAppDataSource.getRepository).toHaveBeenCalledWith(Thread);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: threadId }
      });
      expect(result).toEqual(expectedThread);
    });

    it('should return null when thread not found', async () => {
      const threadId = 'nonexistent';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await threadsDao.findById(threadId);

      expect(result).toBeNull();
    });
  });

  
  describe('updateThread', () => {
    it('should update thread successfully', async () => {
      const threadId = 'thread1';
      const updateData = {
        title: 'Updated Thread',
        content: 'Updated content'
      };

      const updatedThread = {
        id: threadId,
        ...updateData,
        updatedAt: new Date()
      };

      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne.mockResolvedValue(updatedThread);

      const result = await threadsDao.updateThread(threadId, updateData);
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: threadId },
        expect.objectContaining(updateData)
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: threadId }
      });
      expect(result).toEqual(updatedThread);
    });

    it('should throw an error if thread is not found after update', async () => {
      const threadId = 'missing-thread';
      const updateData = {
        title: 'Updated Thread'
      };

      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        threadsDao.updateThread(threadId, updateData)
      ).rejects.toThrow(`Thread with id ${threadId} not found`);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: threadId },
        expect.objectContaining(updateData)
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: threadId }
      });
    });
  });

  describe('findAllByUserId', () => {
    it('should return all threads authored by the given user', async () => {
      const userId = 'user1';
      const threads = [
        {
          id: 'thread1',
          title: 'Thread 1',
          author: { id: userId }
        },
        {
          id: 'thread2',
          title: 'Thread 2',
          author: { id: userId }
        }
      ];

      mockRepository.find.mockResolvedValue(threads);

      const result = await threadsDao.findAllByUserId(userId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          author: {
            id: userId
          }
        },
        relations: ['author']
      });
      expect(result).toEqual(threads);
    });
  });

  describe('createThread', () => {
    it('should create and save a new thread', async () => {
      const inputData = {
        title: 'New Thread',
        content: 'Thread content'
      };

      const createdThread = {
        id: 'thread1',
        ...inputData
      };

      mockRepository.create.mockReturnValue(createdThread);
      mockRepository.save.mockResolvedValue(createdThread);
      const result = await threadsDao.createThread(inputData);

      expect(mockRepository.create).toHaveBeenCalledWith(inputData);
      expect(mockRepository.save).toHaveBeenCalledWith(createdThread);
      expect(result).toEqual(createdThread);
    });
  });

  describe('deleteThread', () => {
    it('should delete thread successfully', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });
      const result = await threadsDao.deleteThread('thread1');
      expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'thread1' });
      expect(result).toBe(true);
    });

    it('should return false if no rows affected', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });
      const result = await threadsDao.deleteThread('thread1');
      expect(result).toBe(false);
    });
  });
});