import bcrypt from 'bcrypt';
import { User } from '../../entities/User';
import { Thread } from '../../entities/Thread';
import { Post } from '../../entities/Post';
import { UserRole } from '../../graphql/enums/UserRole';
import { PostType } from '../../graphql/enums/PostType';
import { AppDataSource } from '../../data-source';

export interface TestData {
  users: User[];
  threads: Thread[];
  posts: Post[];
}

export class Fixtures {
  private static readonly PASSWORD_HASH_ROUNDS = 10;

  static async create(): Promise<TestData> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const threadRepository = AppDataSource.getRepository(Thread);
    const postRepository = AppDataSource.getRepository(Post);

    // Clean up existing data
    await AppDataSource.query(
      'TRUNCATE TABLE "post", "thread", "user" RESTART IDENTITY CASCADE'
    );

    // Create test users
    const hashedPassword = await bcrypt.hash(
      'password123',
      this.PASSWORD_HASH_ROUNDS
    );

    const users = await userRepository.save([
      {
        userName: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@therev.com',
        password: hashedPassword,
        role: UserRole.ADMIN,
        bio: 'System administrator',
        ideology: 'moderate',
      },
      {
        userName: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: hashedPassword,
        role: UserRole.STANDARD,
        bio: 'Regular user interested in politics',
        ideology: 'liberal',
      },
      {
        userName: 'janedoe',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: hashedPassword,
        role: UserRole.STANDARD,
        bio: 'Political enthusiast',
        ideology: 'conservative',
      },
      {
        userName: 'threadadmin',
        firstName: 'Thread',
        lastName: 'Admin',
        email: 'threadadmin@example.com',
        password: hashedPassword,
        role: UserRole.THREAD_ADMIN,
        bio: 'Thread level administrator',
        ideology: 'moderate',
      },
    ]);

    // Create test threads
    const threads = await threadRepository.save([
      threadRepository.create({
        title: 'Climate Change Discussion',
        content:
          'A comprehensive discussion about climate change policies and solutions',
        isLocked: false,
        author: users[1], // johndoe
      }),
      threadRepository.create({
        title: 'Healthcare Reform',
        content:
          'Discussing various approaches to healthcare system improvements',
        isLocked: false,
        author: users[2], // janedoe
      }),
      threadRepository.create({
        title: 'Economic Policies',
        content: 'Discussion about fiscal policies and economic strategies',
        isLocked: true, // Locked thread for testing permissions
        author: users[0], // admin
      }),
    ]);

    // Create test posts
    const posts = await postRepository.save([
      postRepository.create({
        content:
          'Climate change is one of the most pressing issues of our time. We need immediate action to reduce carbon emissions and transition to renewable energy sources.',
        type: PostType.TEXT,
        author: users[1], // johndoe
        thread: threads[0],
        isPinned: true,
      }),
      postRepository.create({
        content:
          'I believe we should invest more in solar and wind power. The technology has improved significantly and costs are coming down.',
        type: PostType.TEXT,
        author: users[2], // janedoe
        thread: threads[0],
      }),
      postRepository.create({
        content:
          'Universal healthcare could work if we implement it properly. Many countries have successful systems we can learn from.',
        type: PostType.TEXT,
        author: users[0], // admin
        thread: threads[1],
        isPinned: true,
      }),
      postRepository.create({
        content:
          'The free market approach might be better for innovation in healthcare.',
        type: PostType.TEXT,
        author: users[1], // johndoe
        thread: threads[1],
      }),
      postRepository.create({
        content:
          'This thread is locked, but this post was created before locking.',
        type: PostType.TEXT,
        author: users[0], // admin
        thread: threads[2],
      }),
    ]);

    return {
      users,
      threads,
      posts,
    };
  }

  static async clear(): Promise<void> {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Clear all data using SQL queries to avoid foreign key constraints
    await AppDataSource.query(
      'TRUNCATE TABLE "post", "thread", "user", "thread_admin" RESTART IDENTITY CASCADE'
    );
  }

  static async destroy(): Promise<void> {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Helper functions for tests
export const createTestUser = async (
  overrides: Partial<User> = {}
): Promise<User> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const userRepository = AppDataSource.getRepository(User);
  const hashedPassword = await bcrypt.hash(
    'password123',
    Fixtures['PASSWORD_HASH_ROUNDS']
  );

  const user = userRepository.create({
    userName: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: hashedPassword,
    role: UserRole.STANDARD,
    bio: 'Test user',
    ideology: 'moderate',
    ...overrides,
  });

  return userRepository.save(user);
};

export const createTestThread = async (
  userId: string,
  overrides: Partial<Thread> = {}
): Promise<Thread> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const threadRepository = AppDataSource.getRepository(Thread);
  const userRepository = AppDataSource.getRepository(User);

  const user = await userRepository.findOne({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }

  const thread = threadRepository.create({
    title: 'Test Thread',
    content: 'Test thread description',
    isLocked: false,
    author: user,
    ...overrides,
  });

  return threadRepository.save(thread);
};

export const createTestPost = async (
  userId: string,
  threadId: string,
  overrides: Partial<Post> = {}
): Promise<Post> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const postRepository = AppDataSource.getRepository(Post);
  const userRepository = AppDataSource.getRepository(User);
  const threadRepository = AppDataSource.getRepository(Thread);

  const [user, thread] = await Promise.all([
    userRepository.findOne({ where: { id: userId } }),
    threadRepository.findOne({ where: { id: threadId } }),
  ]);

  if (!user || !thread) {
    throw new Error('User or Thread not found');
  }

  const post = postRepository.create({
    content: 'Test post content',
    type: PostType.TEXT,
    author: user,
    thread,
    ...overrides,
  });

  return postRepository.save(post);
};
