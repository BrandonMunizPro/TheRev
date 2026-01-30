import request from 'supertest';
import { createTestApp } from '../setup/testApp';
import { AppDataSource } from '../../data-source';
import { Fixtures } from '../fixtures';

describe('Post GraphQL Integration Tests', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    await AppDataSource.initialize();
    app = await createTestApp();

    // Get auth token for johndoe
    const loginResponse = await request(app)
      .post('/graphql')
      .send({
        query: `
          mutation LoginUser($identifier: UserIdentifierInput!, $password: String!) {
            verifyUser(identifier: $identifier, password: $password) {
              jwt
              user {
                id
                userName
                email
              }
            }
          }
        `,
        variables: {
          identifier: { userName: 'johndoe' },
          password: 'password123',
        },
      });

    console.log('Login response:', JSON.stringify(loginResponse.body, null, 2));
    authToken = loginResponse.body.data?.verifyUser?.jwt;
  });

  afterAll(async () => {
    await AppDataSource.destroy();
  });

  beforeEach(async () => {
    await Fixtures.clear();
  });

  describe('Post Mutations', () => {
    const CREATE_POST_MUTATION = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          id
          content
          type
          isPinned
          metadata
          createdAt
          author {
            id
            userName
            firstName
          }
          thread {
            id
            title
          }
        }
      }
    `;

    const UPDATE_POST_MUTATION = `
      mutation UpdatePost($id: ID!, $input: UpdatePostInput!) {
        updatePost(id: $id, input: $input) {
          id
          content
          type
          isPinned
          metadata
          updatedAt
        }
      }
    `;

    const DELETE_POST_MUTATION = `
      mutation DeletePost($id: ID!) {
        deletePost(id: $id)
      }
    `;

    const PIN_POST_MUTATION = `
      mutation UpdatePostPin($input: UpdatePostPinnedInput!) {
        updatePostPin(input: $input) {
          id
          isPinned
          updatedAt
        }
      }
    `;

    it('should create a new post via GraphQL mutation', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const variables = {
        input: {
          threadId,
          content: 'This is a new test post about climate change policies.',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: CREATE_POST_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.createPost).toMatchObject({
        content: variables.input.content,
        type: variables.input.type,
        isPinned: false,
      });
      expect(response.body.data.createPost.id).toBeDefined();
      expect(response.body.data.createPost.createdAt).toBeDefined();
      expect(response.body.data.createPost.author.userName).toBe('johndoe');
      expect(response.body.data.createPost.thread.id).toBe(threadId);
    });

    it('should create a post with metadata', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const variables = {
        input: {
          threadId,
          content: 'Video post about renewable energy',
          type: 'TEXT',
          metadata: {
            thumbnailUrl: 'https://example.com/thumb.jpg',
            duration: 300,
            provider: 'youtube',
          },
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: CREATE_POST_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.createPost.metadata).toEqual(
        variables.input.metadata
      );
    });

    it('should update an existing post', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[0].id;

      const variables = {
        id: postId,
        input: {
          content: 'Updated post content with more details',
          metadata: {
            thumbnailUrl: 'https://example.com/updated-thumb.jpg',
          },
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: UPDATE_POST_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.updatePost).toMatchObject({
        id: postId,
        content: variables.input.content,
      });
      expect(response.body.data.updatePost.updatedAt).toBeDefined();
    });

    it('should pin a post', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[1].id;

      const variables = {
        input: {
          postId,
          isPinned: true,
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: PIN_POST_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.updatePostPin).toMatchObject({
        id: postId,
        isPinned: true,
      });
      expect(response.body.data.updatePostPin.updatedAt).toBeDefined();
    });

    it('should delete a post', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[1].id; // johndoe's post

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: DELETE_POST_MUTATION,
          variables: { id: postId },
        })
        .expect(200);

      expect(response.body.data.deletePost).toBe(true);
    });

    it('should not create post without authentication', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const variables = {
        input: {
          threadId,
          content: 'Unauthorized post',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: CREATE_POST_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain(
        'Authentication required'
      );
    });
  });

  describe('Post Queries', () => {
    const GET_POSTS_BY_THREAD_QUERY = `
      query GetPostsByThread($threadId: ID!, $limit: Int, $offset: Int) {
        postsByThread(threadId: $threadId, limit: $limit, offset: $offset) {
          id
          content
          type
          isPinned
          metadata
          createdAt
          updatedAt
          author {
            id
            userName
            firstName
            lastName
          }
          thread {
            id
            title
          }
        }
      }
    `;

    const GET_POST_QUERY = `
      query GetPost($id: ID!) {
        post(id: $id) {
          id
          content
          type
          isPinned
          metadata
          createdAt
          updatedAt
          author {
            id
            userName
            firstName
            lastName
          }
          thread {
            id
            title
            isLocked
          }
        }
      }
    `;

    const GET_PINNED_POSTS_QUERY = `
      query GetPinnedPosts($threadId: ID) {
        pinnedPosts(threadId: $threadId) {
          id
          content
          type
          isPinned
          createdAt
          author {
            userName
          }
          thread {
            title
          }
        }
      }
    `;

    it('should get posts by thread ID with pagination', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_POSTS_BY_THREAD_QUERY,
          variables: { threadId, limit: 10, offset: 0 },
        })
        .expect(200);

      expect(response.body.data.postsByThread).toBeDefined();
      expect(Array.isArray(response.body.data.postsByThread)).toBe(true);
      expect(response.body.data.postsByThread.length).toBe(2); // 2 posts in first thread from fixtures

      const post = response.body.data.postsByThread[0];
      expect(post).toMatchObject({
        content: expect.any(String),
        type: 'TEXT',
        isPinned: expect.any(Boolean),
      });
      expect(post.author.userName).toBeDefined();
      expect(post.thread.id).toBe(threadId);
    });

    it('should get a specific post by ID', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[0].id;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_POST_QUERY,
          variables: { id: postId },
        })
        .expect(200);

      expect(response.body.data.post).toMatchObject({
        id: postId,
        content:
          'Climate change is one of the most pressing issues of our time. We need immediate action to reduce carbon emissions and transition to renewable energy sources.',
        type: 'TEXT',
        isPinned: true,
      });
      expect(response.body.data.post.author.userName).toBe('johndoe');
      expect(response.body.data.post.thread.title).toBe(
        'Climate Change Discussion'
      );
    });

    it('should get only pinned posts', async () => {
      const testData = await Fixtures.create();

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_PINNED_POSTS_QUERY,
        })
        .expect(200);

      expect(response.body.data.pinnedPosts).toBeDefined();
      expect(Array.isArray(response.body.data.pinnedPosts)).toBe(true);

      // All returned posts should be pinned
      response.body.data.pinnedPosts.forEach((post: any) => {
        expect(post.isPinned).toBe(true);
      });
    });

    it('should return null for non-existent post', async () => {
      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_POST_QUERY,
          variables: { id: 'non-existent-id' },
        })
        .expect(200);

      expect(response.body.data.post).toBeNull();
    });
  });

  describe('Post Permissions', () => {
    const CREATE_POST_MUTATION = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          id
          content
        }
      }
    `;

    const UPDATE_POST_MUTATION = `
      mutation UpdatePost($id: ID!, $input: UpdatePostInput!) {
        updatePost(id: $id, input: $input) {
          id
          content
        }
      }
    `;

    const DELETE_POST_MUTATION = `
      mutation DeletePost($id: ID!) {
        deletePost(id: $id)
      }
    `;

    it('should allow post author to update their own post', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[1].id;

      // Login as janedoe
      const loginResponse = await request(app)
        .post('/graphql')
        .send({
          query: `
            mutation LoginUser($identifier: UserIdentifierInput!, $password: String!) {
              verifyUser(identifier: $identifier, password: $password) {
                jwt
              }
            }
          `,
          variables: {
            identifier: { userName: 'janedoe' },
            password: 'password123',
          },
        });

      const userToken = loginResponse.body.data.verifyUser.jwt;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          query: UPDATE_POST_MUTATION,
          variables: {
            id: postId,
            input: { content: 'Updated by Author' },
          },
        })
        .expect(200);

      expect(response.body.data.updatePost.content).toBe('Updated by Author');
    });

    it('should not allow non-author to update post', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[0].id;
      const loginResponse = await request(app)
        .post('/graphql')
        .send({
          query: `
            mutation LoginUser($identifier: UserIdentifierInput!, $password: String!) {
              verifyUser(identifier: $identifier, password: $password) {
                jwt
              }
            }
          `,
          variables: {
            identifier: { userName: 'janedoe' },
            password: 'password123',
          },
        });

      const otherUserToken = loginResponse.body.data.verifyUser.jwt;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          query: UPDATE_POST_MUTATION,
          variables: {
            id: postId,
            input: { content: 'Should Not Work' },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('permission');
    });

    it('should not allow creating posts in locked thread', async () => {
      const testData = await Fixtures.create();
      const lockedThreadId = testData.threads[2].id; // This is locked

      const variables = {
        input: {
          threadId: lockedThreadId,
          content: 'This should fail in locked thread',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: CREATE_POST_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('locked');
    });

    it('should allow admin to pin posts', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[1].id; // Unpinned post

      const loginResponse = await request(app)
        .post('/graphql')
        .send({
          query: `
            mutation LoginUser($identifier: UserIdentifierInput!, $password: String!) {
              verifyUser(identifier: $identifier, password: $password) {
                jwt
              }
            }
          `,
          variables: {
            identifier: { userName: 'admin' },
            password: 'password123',
          },
        });

      const adminToken = loginResponse.body.data.verifyUser.jwt;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          query: `
            mutation UpdatePostPin($input: UpdatePostPinnedInput!) {
              updatePostPin(input: $input) {
                id
                isPinned
              }
            }
          `,
          variables: {
            input: {
              postId,
              isPinned: true,
            },
          },
        })
        .expect(200);

      expect(response.body.data.updatePostPin.isPinned).toBe(true);
    });

    it('should not allow regular user to pin posts', async () => {
      const testData = await Fixtures.create();
      const postId = testData.posts[1].id;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: `
            mutation UpdatePostPin($input: UpdatePostPinnedInput!) {
              updatePostPin(input: $input) {
                id
                isPinned
              }
            }
          `,
          variables: {
            input: {
              postId,
              isPinned: true,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('permission');
    });
  });

  describe('Post Edge Cases', () => {
    const CREATE_POST_MUTATION = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          id
        }
      }
    `;

    it('should handle pagination in posts query', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: `
            query GetPostsByThread($threadId: ID!, $limit: Int, $offset: Int) {
              postsByThread(threadId: $threadId, limit: $limit, offset: $offset) {
                id
                content
              }
            }
          `,
          variables: { threadId, limit: 1, offset: 0 },
        })
        .expect(200);

      expect(response.body.data.postsByThread.length).toBeLessThanOrEqual(1);
    });

    it('should handle empty metadata', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const variables = {
        input: {
          threadId,
          content: 'Post without metadata',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: `
            mutation CreatePost($input: CreatePostInput!) {
              createPost(input: $input) {
                id
                content
                metadata
              }
            }
          `,
          variables,
        })
        .expect(200);

      expect(response.body.data.createPost.metadata).toBeUndefined();
    });
  });
});
