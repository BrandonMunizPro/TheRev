import { UsersDao } from '../../dao/users.dao';
import { AppDataSource } from '../../data-source';
import { UserRole } from '../../graphql/enums/UserRole';

jest.mock('../../data-source');
const mockAppDataSource = AppDataSource as jest.Mocked<typeof AppDataSource>;

// Mock User entity to avoid GraphQL type reflection issues
jest.mock('../../entities/User', () => ({
  User: class {}
}));

describe('UsersDao', () => {
  let usersDao: UsersDao;
  let mockQuery: jest.Mock;
  let mockRepository: any;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    
    // Mock AppDataSource before creating DAO
    mockAppDataSource.query = mockQuery;
    mockAppDataSource.getRepository = jest.fn().mockReturnValue(mockRepository);
    
    usersDao = new UsersDao();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const userId = 'user1';
      const expectedUser = {
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        role: UserRole.STANDARD
      };

      mockRepository.findOne.mockResolvedValue(expectedUser);

      const result = await usersDao.findById(userId);

      expect(mockAppDataSource.getRepository).toHaveBeenCalledWith(expect.any(Function));
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId }
      });
      expect(result).toEqual(expectedUser);
    });

    it('should return null when user not found', async () => {
      const userId = 'nonexistent';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await usersDao.findById(userId);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const userId = 'user1';
      const error = new Error('Database connection failed');

      mockRepository.findOne.mockRejectedValue(error);

      await expect(usersDao.findById(userId)).rejects.toThrow(error);
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      const email = 'test@example.com';
      const expectedUser = {
        id: 'user1',
        email,
        username: 'testuser',
        role: UserRole.STANDARD
      };

      mockRepository.findOne.mockResolvedValue(expectedUser);

      const result = await usersDao.findByEmail(email);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email }
      });
      expect(result).toEqual(expectedUser);
    });

    it('should return null when email not found', async () => {
      const email = 'nonexistent@example.com';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await usersDao.findByEmail(email);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedpassword',
        role: UserRole.STANDARD
      };
      const savedUser = {
        id: 'user1',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockRepository.create.mockReturnValue(userData);
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await usersDao.create(userData);

      expect(mockRepository.create).toHaveBeenCalledWith(userData);
      expect(mockRepository.save).toHaveBeenCalledWith(userData);
      expect(result).toEqual(savedUser);
    });
  });
});