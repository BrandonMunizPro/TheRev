import request from 'supertest';
import { createTestApp } from '../setup/testApp';
import { AppDataSource } from '../../data-source';
import { Fixtures } from '../fixtures';

describe('User GraphQL Integration Tests', () => {
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

  describe('User Mutations', () => {
    const REGISTER_MUTATION = `
      mutation RegisterUser($data: CreateUserInput!) {
        createUser(data: $data) {
          id
          userName
          firstName
          lastName
          email
          bio
          ideology
          createdAt
        }
      }
    `;

    const LOGIN_MUTATION = `
      mutation LoginUser($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          id
          userName
          firstName
          lastName
          email
          bio
          ideology
          jwt
        }
      }
    `;

    it('should register a new user via GraphQL mutation', async () => {
      const variables = {
        data: {
          userName: 'newuser',
          firstName: 'New',
          lastName: 'User',
          email: 'newuser@example.com',
          password: 'password123',
          bio: 'Test user bio',
          ideology: 'moderate',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: REGISTER_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.createUser).toMatchObject({
        userName: variables.data.userName,
        firstName: variables.data.firstName,
        lastName: variables.data.lastName,
        email: variables.data.email,
        bio: variables.data.bio,
        ideology: variables.data.ideology,
      });
      expect(response.body.data.createUser.id).toBeDefined();
      expect(response.body.data.createUser.createdAt).toBeDefined();
    });

    it('should login with valid credentials via GraphQL mutation', async () => {
      // First create a user
      await Fixtures.create();

      const variables = {
        email: 'admin@therev.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: LOGIN_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.data.login).toMatchObject({
        userName: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@therev.com',
      });
      expect(response.body.data.login.jwt).toBeDefined();
    });

    it('should not login with invalid credentials', async () => {
      await Fixtures.create();

      const variables = {
        email: 'admin@therev.com',
        password: 'wrongpassword',
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: LOGIN_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain(
        'Invalid user or password'
      );
    });

    it('should handle duplicate email registration', async () => {
      await Fixtures.create();

      const variables = {
        data: {
          userName: 'differentuser',
          firstName: 'Different',
          lastName: 'User',
          email: 'admin@therev.com', // Already exists in fixtures
          password: 'password123',
          bio: 'Test user bio',
          ideology: 'moderate',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: REGISTER_MUTATION,
          variables,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain(
        'Email is already in use'
      );
    });
  });

  describe('User Queries', () => {
    const GET_USERS_QUERY = `
      query GetUsers {
        users {
          id
          userName
          firstName
          lastName
          email
          bio
          ideology
          createdAt
        }
      }
    `;

    const GET_USER_QUERY = `
      query GetUser($data: GetUserInput!) {
        user(data: $data) {
          id
          userName
          firstName
          lastName
          email
          bio
          ideology
          createdAt
        }
      }
    `;

    it('should get all users via GraphQL query', async () => {
      await Fixtures.create();

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_USERS_QUERY,
        })
        .expect(200);

      expect(response.body.data.users).toBeDefined();
      expect(Array.isArray(response.body.data.users)).toBe(true);
      expect(response.body.data.users.length).toBeGreaterThan(0);
      expect(response.body.data.users[0]).toMatchObject({
        userName: expect.any(String),
        firstName: expect.any(String),
        lastName: expect.any(String),
        email: expect.any(String),
      });
    });

    it('should get a specific user by username via GraphQL query', async () => {
      const testData = await Fixtures.create();

      const variables = {
        data: {
          userName: 'johndoe',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_USER_QUERY,
          variables,
        })
        .expect(200);

      expect(response.body.data.user).toMatchObject({
        userName: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        bio: 'Regular user interested in politics',
        ideology: 'liberal',
      });
    });

    it('should get a specific user by email via GraphQL query', async () => {
      const testData = await Fixtures.create();

      const variables = {
        data: {
          email: 'admin@therev.com',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_USER_QUERY,
          variables,
        })
        .expect(200);

      expect(response.body.data.user).toMatchObject({
        userName: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@therev.com',
      });
    });

    it('should return null for non-existent user', async () => {
      const variables = {
        data: {
          userName: 'nonexistent',
        },
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_USER_QUERY,
          variables,
        })
        .expect(200);

      expect(response.body.data.user).toBeNull();
    });

    it('should require at least one identifier parameter', async () => {
      const variables = {
        data: {},
      };

      const response = await request(app)
        .post('/graphql')
        .send({
          query: GET_USER_QUERY,
          variables,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain(
        'Please provide either id, username, or email'
      );
    });
  });
});
