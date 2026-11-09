import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('health and platform middleware', () => {
  it('reports liveness without touching dependencies', async () => {
    const response = await request(app).get('/health/live').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', version: expect.any(String) });
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports readiness with database and engine checks', async () => {
    const response = await request(app).get('/health/ready').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.ok).toBe(true);
    expect(response.body.checks.engine.ok).toBe(true);
  });

  it('exposes a simple service identity at /health', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'bua-aidm-backend-api' });
  });

  it('returns a structured 404 for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(response.body.error.correlationId).toEqual(expect.any(String));
  });

  it('echoes a caller-supplied correlation id', async () => {
    const response = await request(app)
      .get('/health/live')
      .set('x-correlation-id', 'test-correlation-123')
      .expect(200);
    expect(response.headers['x-correlation-id']).toBe('test-correlation-123');
  });

  it('applies helmet security headers and hides the server banner', async () => {
    const response = await request(app).get('/health/live').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured CORS origins and withholds the header for others', async () => {
    const allowed = await request(app)
      .options('/api/auth/login')
      .set('origin', 'http://localhost:5173')
      .set('access-control-request-method', 'POST')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const blocked = await request(app)
      .options('/api/auth/login')
      .set('origin', 'http://evil.example')
      .set('access-control-request-method', 'POST');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
});
