import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { technicalCopilotRouter } from '../../technicalCopilotRoutes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(technicalCopilotRouter);
  return app;
}

function signToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET_KEY || 'test-secret-key', {
    expiresIn: '1h',
  });
}

describe('Technical Copilot REST API Authorization', () => {
  const app = createApp();

  it('should reject requests without authentication (401)', async () => {
    const res = await request(app).post('/api/copilot/session');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject authenticated users without the capability (403)', async () => {
    const token = signToken('standard-user', 'STANDARD');
    const res = await request(app)
      .post('/api/copilot/session')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow an authorized admin user to start a session', async () => {
    const token = signToken('admin-user', 'ADMIN');
    const res = await request(app)
      .post('/api/copilot/session')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session.id).toBeTruthy();
    expect(res.body.session.userId).toBe('admin-user');
  });

  it('should process a transcript fragment and return a concept cue for an authorized user', async () => {
    const token = signToken('admin-user', 'ADMIN');

    const sessionRes = await request(app)
      .post('/api/copilot/session')
      .set('Authorization', `Bearer ${token}`);
    const sessionId = sessionRes.body.session.id;

    const transcriptRes = await request(app)
      .post('/api/copilot/transcript')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionId,
        text: 'How would you prevent duplicate processing if this consumer retries?',
      });

    expect(transcriptRes.status).toBe(200);
    expect(transcriptRes.body.success).toBe(true);
    expect(transcriptRes.body.cue).not.toBeNull();
    expect(transcriptRes.body.cue.concepts.length).toBeGreaterThan(0);
  });

  it('should prevent a user from accessing another users session', async () => {
    const adminToken = signToken('admin-user', 'ADMIN');
    const otherToken = signToken('other-admin', 'ADMIN');

    const sessionRes = await request(app)
      .post('/api/copilot/session')
      .set('Authorization', `Bearer ${adminToken}`);
    const sessionId = sessionRes.body.session.id;

    const transcriptRes = await request(app)
      .post('/api/copilot/transcript')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ sessionId, text: 'What should I do?' });

    expect(transcriptRes.status).toBe(200);
    expect(transcriptRes.body.success).toBe(false);
    expect(transcriptRes.body.error).toBe('Invalid session');
  });

  it('should return proper errors for malformed requests', async () => {
    const token = signToken('admin-user', 'ADMIN');
    const res = await request(app)
      .post('/api/copilot/transcript')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: 'bad', text: 'test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it('should allow ending a session', async () => {
    const token = signToken('admin-user', 'ADMIN');

    const sessionRes = await request(app)
      .post('/api/copilot/session')
      .set('Authorization', `Bearer ${token}`);
    const sessionId = sessionRes.body.session.id;

    const endRes = await request(app)
      .post(`/api/copilot/session/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.success).toBe(true);
  });
});