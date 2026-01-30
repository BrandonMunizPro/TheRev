import request from 'supertest';
import { createTestApp } from '../setup/testApp';
import { AppDataSource } from '../../data-source';
import { Fixtures } from '../fixtures';

describe('Thread GraphQL Integration Tests', () => {
  let app: any;

  beforeAll(async () => {
    await AppDataSource.initialize();
    app = await createTestApp();
  });

  afterAll(async () => {
    await AppDataSource.destroy();
  });

  beforeEach(async () => {
    await Fixtures.clear();
  });

  describe('Thread Mutations', () => {
    const CREATE_THREAD_MUTATION = `
      mutation CreateThread($input: CreateThreadInput!) {
        createThread(input: $input) {
          id
          title
          content
          createdAt
          updatedAt
          isLocked
          isPinned
          author {
            id
            userName
            firstName
          }
        }
      }
    `;

    const UPDATE_THREAD_MUTATION = `
      mutation UpdateThread($data: UpdateThreadInput!) {
        updateThread(data: $data) {
          id
          title
          content
          updatedAt
          isLocked
          isPinned
        }
      }
    `;

    it('should create a new thread via GraphQL mutation', async () => {
      const testData = await Fixtures.create();

      // First login to get auth token
      const loginResponse = await request(app)
        .post('/graphql')
        .send({
          query: `
            mutation LoginUser($email: String!, $password: String!) {
              login(email: $email, password: $password) {
                jwt
              }
            }
          `,
          variables: {
            email: 'admin@therev.com',
            password: 'password123',
          },
        });

      const authToken = loginResponse.body.data.login.jwt;

      const variables = {
        input: {
          title: 'New Test Thread',
          content:
            'This is a test thread with detailed content about an important topic.',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: CREATE_THREAD_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.createThread).toMatchObject({
        title: variables.input.title,
        content: variables.input.content,
        isLocked: false,
        isPinned: false,
      });
      expect(response.body.data.createThread.id).toBeDefined();
      expect(response.body.data.createThread.createdAt).toBeDefined();
      expect(response.body.data.createThread.author.userName).toBe('admin');
    });

    it('should not create thread without authentication', async () => {
      const variables = {
        input: {
          title: 'Unauthorized Thread',
          content: 'This should not be created',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: CREATE_THREAD_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Not authenticated');
    });
  });

  describe('Thread Queries', () => {
    const GET_THREAD_QUERY = `
      query GetThread($data: ThreadQueryInput!) {
        getThread(data: $data) {
          id
          title
          content
          isLocked
          isPinned
          createdAt
          updatedAt
          author {
            id
            userName
            firstName
            lastName
          }
        }
      }
    `;

    const LIST_THREADS_QUERY = `
      query ListThreads {
        listThreads {
          id
          title
          content
          isLocked
          isPinned
          createdAt
          updatedAt
          author {
            userName
            firstName
          }
        }
      }
    `;

    it('should get a specific thread by ID', async () => {
      const testData = await Fixtures.create();
      const threadId = testData.threads[0].id;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_THREAD_QUERY,
          variables: { data: { id: threadId } },
        })
        .expect(200);

      expect(response.body.data.getThread).toMatchObject({
        title: 'Climate Change Discussion',
        content:
          'A comprehensive discussion about climate change policies and solutions',
      });
      expect(response.body.data.getThread.author.userName).toBe('johndoe');
    });

    it('should list threads when authenticated', async () => {
      const testData = await Fixtures.create();

      // Login first
      const loginResponse = await request(app)
        .post('/graphql')
        .send({
          query: `
            mutation LoginUser($email: String!, $password: String!) {
              login(email: $email, password: $password) {
                jwt
              }
            }
          `,
          variables: {
            email: 'admin@therev.com',
            password: 'password123',
          },
        });

      const authToken = loginResponse.body.data.login.jwt;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: LIST_THREADS_QUERY,
        })
        .expect(200);

      expect(response.body.data.listThreads).toBeDefined();
      expect(Array.isArray(response.body.data.listThreads)).toBe(true);
      expect(response.body.data.listThreads.length).toBeGreaterThan(0);

      const thread = response.body.data.listThreads[0];
      expect(thread).toMatchObject({
        title: expect.any(String),
        content: expect.any(String),
        isLocked: expect.any(Boolean),
        isPinned: expect.any(Boolean),
      });
      expect(thread.author.userName).toBeDefined();
    });

    it('should not list threads without authentication', async () => {
      const response = await request(app)
        .post('/graphql')
        .send({
          query: LIST_THREADS_QUERY,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Not authenticated');
    });

    it('should return null for non-existent thread', async () => {
      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_THREAD_QUERY,
          variables: { data: { id: 'non-existent-id' } },
        })
        .expect(200);

      expect(response.body.data.getThread).toBeNull();
    });
  });

  describe('Thread Edge Cases', () => {
    const CREATE_THREAD_MUTATION = `
      mutation CreateThread($input: CreateThreadInput!) {
        createThread(input: $input) {
          id
        }
      }
    `;

    it('should handle thread creation with minimal data', async () => {
      const testData = await Fixtures.create();

      // Login first
      const loginResponse = await request(app)
        .post('/graphql')
        .send({
          query: `
            mutation LoginUser($email: String!, $password: String!) {
              login(email: $email, password: $password) {
                jwt
              }
            }
          `,
          variables: {
            email: 'admin@therev.com',
            password: 'password123',
          },
        });

      const authToken = loginResponse.body.data.login.jwt;

      const variables = {
        input: {
          title: 'Minimal Thread',
          content: 'Content',
          type: 'TEXT',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: CREATE_THREAD_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.createThread.id).toBeDefined();
    });
  });
});
