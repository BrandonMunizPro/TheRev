import { Thread } from '../entities/Thread';
import { ThreadsDao } from '../dao/threads.dao';
import {
  CreateThreadInput,
  UpdateThreadInput,
  ThreadQueryInput,
  UpdateThreadPinOrLockInput,
  returnedThread,
  returnedThreadWithLockAndPins,
} from '../resolvers/Thread';
import { UsersDao } from '../dao/users.dao';
import { PostsDao } from '../dao/posts.dao';
import { PermissionsService } from '../services/permissionsService';
import { ErrorHandler } from '../errors/ErrorHandler';

export class ThreadsModel {
  private readonly dao: ThreadsDao;
  private readonly usersDao: UsersDao;
  private readonly postsDao: PostsDao;
  private readonly permissionsService: PermissionsService;

  constructor() {
    this.dao = new ThreadsDao();
    this.usersDao = new UsersDao();
    this.postsDao = new PostsDao();
    this.permissionsService = new PermissionsService();
  }

  async getThread(data: ThreadQueryInput): Promise<returnedThread | null> {
    if (!data.id) {
      throw ErrorHandler.missingRequiredField('id');
    }

    let thread: Thread | null = null;
    thread = await this.dao.findByIdWithReplies(data.id);
    if (!thread) return null;

    // Fetch vote counts for this thread
    const voteCountsMap = await this.dao.getVoteCountsForThreads([thread.id]);

    // Calculate post perspective counts from loaded posts (includes replies)
    const postCounts = { PRO: 0, AGAINST: 0, NEUTRAL: 0, total: 0 };
    if (thread.posts) {
      thread.posts.forEach((post) => {
        const persp = post.perspective || 'NEUTRAL';
        postCounts[persp]++;
        postCounts.total++;
        if (post.replies) {
          post.replies.forEach((reply) => {
            const replyPersp = reply.perspective || 'NEUTRAL';
            postCounts[replyPersp]++;
            postCounts.total++;
          });
        }
      });
    }

    // Get vote counts (or zeros if none)
    const voteCounts = voteCountsMap.get(thread.id) || {
      PRO: 0,
      AGAINST: 0,
      NEUTRAL: 0,
      total: 0,
    };

    // Combine
    const combinedVoteCounts = {
      PRO: (voteCounts.PRO || 0) + (postCounts.PRO || 0),
      AGAINST: (voteCounts.AGAINST || 0) + (postCounts.AGAINST || 0),
      NEUTRAL: (voteCounts.NEUTRAL || 0) + (postCounts.NEUTRAL || 0),
      total: (voteCounts.total || 0) + (postCounts.total || 0),
    };

    console.log(
      `[getThread] Thread "${thread.title}": votes=${JSON.stringify(voteCounts)}, posts=${JSON.stringify(postCounts)}, combined=${JSON.stringify(combinedVoteCounts)}`
    );

    return {
      id: thread.id,
      author: thread.author,
      title: thread.title,
      content: thread.content,
      posts: thread.posts,
      voteCounts: combinedVoteCounts,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  async listAllThreads(userId: string): Promise<returnedThread[] | null> {
    const user = await this.usersDao.findById(userId);
    if (!user) {
      throw ErrorHandler.userNotFound(userId);
    }
    const threads = await this.dao.findAllWithMetadata();

    // Fetch vote counts for all threads
    const threadIds = threads.map((t) => t.id);
    const voteCountsMap = await this.dao.getVoteCountsForThreads(threadIds);

    // Calculate post perspective counts from already-loaded posts (includes replies)
    const postCountsMap = new Map<
      string,
      { PRO: number; AGAINST: number; NEUTRAL: number; total: number }
    >();
    threads.forEach((thread) => {
      const postCounts = { PRO: 0, AGAINST: 0, NEUTRAL: 0, total: 0 };
      console.log(
        `[listAllThreads] Thread "${thread.title}": posts count = ${thread.posts?.length || 0}`
      );
      if (thread.posts) {
        thread.posts.forEach((post) => {
          console.log(
            `[listAllThreads]   Post: "${post.content?.substring(0, 30)}...", perspective = ${post.perspective}`
          );
          const persp = post.perspective || 'NEUTRAL';
          postCounts[persp]++;
          postCounts.total++;
          // Also count replies
          if (post.replies) {
            post.replies.forEach((reply) => {
              const replyPersp = reply.perspective || 'NEUTRAL';
              postCounts[replyPersp]++;
              postCounts.total++;
            });
          }
        });
      }
      postCountsMap.set(thread.id, postCounts);
    });

    // Return new objects with voteCounts properly set
    const result: returnedThread[] = threads.map((thread) => {
      const voteCounts = voteCountsMap.get(thread.id) || {
        PRO: 0,
        AGAINST: 0,
        NEUTRAL: 0,
        total: 0,
      };
      const postCounts = postCountsMap.get(thread.id) || {
        PRO: 0,
        AGAINST: 0,
        NEUTRAL: 0,
        total: 0,
      };
      console.log(
        `[listAllThreads] Thread "${thread.title}": votes=${JSON.stringify(voteCounts)}, posts=${JSON.stringify(postCounts)}`
      );
      return {
        id: thread.id,
        title: thread.title,
        content: thread.content,
        author: thread.author,
        posts: thread.posts,
        voteCounts: {
          PRO: (voteCounts.PRO || 0) + (postCounts.PRO || 0),
          AGAINST: (voteCounts.AGAINST || 0) + (postCounts.AGAINST || 0),
          NEUTRAL: (voteCounts.NEUTRAL || 0) + (postCounts.NEUTRAL || 0),
          total: (voteCounts.total || 0) + (postCounts.total || 0),
        },
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    });

    console.log('[listAllThreads] Returning threads with voteCounts');
    return result;
  }

  async listThreadsByUser(
    userId: string,
    userIdContext: string
  ): Promise<returnedThread[] | null> {
    console.log(
      '[listThreadsByUser] userId:',
      userId,
      'userIdContext:',
      userIdContext
    );

    const user = await this.usersDao.findById(userId);

    if (!user) {
      console.log('[listThreadsByUser] User not found:', userId);
      throw ErrorHandler.userNotFound(userId);
    }

    // Allow any logged-in user to view threads
    if (!userIdContext) {
      console.log('[listThreadsByUser] Not authenticated');
      throw ErrorHandler.notAuthenticated();
    }

    console.log('[listThreadsByUser] Fetching threads for user:', userId);
    const threads = await this.dao.findAllByUserId(userId);
    console.log('[listThreadsByUser] Found threads:', threads.length);
    return threads;
  }

  async listThreadsUserParticipatedIn(
    userId: string
  ): Promise<returnedThread[] | null> {
    const threads = await this.dao.findThreadsUserParticipatedIn(userId);
    return threads;
  }

  async listUserParticipatedIn(
    userId: string
  ): Promise<returnedThread[] | null> {
    const threads = await this.dao.findThreadsUserParticipatedIn(userId);
    return threads;
  }

  private extractVideoMetadata(
    content: string
  ): { thumbnailUrl?: string; provider?: 'youtube' | 'vimeo' } | undefined {
    // YouTube patterns
    const youtubePatterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of youtubePatterns) {
      const match = content.match(pattern);
      if (match) {
        return {
          thumbnailUrl: `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`,
          provider: 'youtube',
        };
      }
    }

    // Vimeo patterns
    const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return {
        provider: 'vimeo' as const,
      };
    }

    return undefined;
  }

  async createThread(
    input: CreateThreadInput,
    authorId: string
  ): Promise<returnedThread> {
    const author = await this.usersDao.findById(authorId);
    if (!author) throw ErrorHandler.userNotFound(authorId);

    const thread = await this.dao.createThread({
      title: input.title,
      content: input.content,
      author,
    });

    // Extract video metadata if type is VIDEO
    let metadata;
    if (input.type === 'VIDEO') {
      metadata = this.extractVideoMetadata(input.content);
    }

    const post = await this.postsDao.createPostRaw(
      input.content,
      author.id,
      thread.id,
      input.type,
      new Date(),
      metadata
    );

    thread.posts = [post];

    return {
      id: thread.id,
      title: thread.title,
      content: thread.content,
      author: thread.author,
      posts: thread.posts,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  async deleteThread(id: string, userId: string): Promise<boolean> {
    const thread = await this.dao.findById(id);

    if (!thread) {
      throw ErrorHandler.threadNotFound(id);
    }

    const user = await this.usersDao.findById(userId);

    if (!user) {
      throw ErrorHandler.userNotFound(userId);
    }

    const isOwner = thread.author.id === userId;
    const isAdmin =
      await this.permissionsService.checkAdminOrThreadAdmin(userId);

    if (!isAdmin && !isOwner) {
      throw ErrorHandler.insufficientPermissions('delete', 'thread');
    }

    return this.dao.deleteThread(id);
  }

  async editThread(
    data: UpdateThreadInput,
    userId: string
  ): Promise<returnedThread> {
    const thread = await this.dao.findById(data.threadId);

    if (!thread) {
      throw ErrorHandler.threadNotFound(data.threadId);
    }

    const user = await this.usersDao.findById(userId);

    if (!user) {
      throw ErrorHandler.userNotFound(userId);
    }

    const isOwner = thread.author.id === userId;
    const isAdmin =
      await this.permissionsService.checkAdminOrThreadAdmin(userId);

    if (!isAdmin && !isOwner) {
      throw ErrorHandler.insufficientPermissions('edit', 'thread');
    }

    return this.dao.updateThread(data.threadId, data);
  }

  async threadPinAndLockToggler(
    data: UpdateThreadPinOrLockInput,
    userId: string
  ): Promise<returnedThreadWithLockAndPins> {
    const thread = await this.dao.findById(data.threadId);

    if (!thread) {
      throw ErrorHandler.threadNotFound(data.threadId);
    }

    const user = await this.usersDao.findById(userId);

    if (!user) {
      throw ErrorHandler.userNotFound(userId);
    }

    const isOwner = thread.author.id === userId;
    const isAdmin =
      await this.permissionsService.checkAdminOrThreadAdmin(userId);

    if (!isAdmin && !isOwner) {
      throw ErrorHandler.insufficientPermissions('edit', 'thread');
    }

    if (!data.isLocked && !data.isPinned) {
      throw ErrorHandler.invalidInput(
        'Select either a thread or pin to update'
      );
    }
    const updatedThread = await this.dao.updateThread(data.threadId, data);
    return {
      id: updatedThread.id,
      title: updatedThread.title,
      isLocked: updatedThread.isLocked,
      isPinned: updatedThread.isPinned,
      updatedAt: updatedThread.updatedAt,
      createdAt: updatedThread.createdAt,
    } as returnedThreadWithLockAndPins;
  }
}
