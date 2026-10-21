import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import api, { normalizeApiBaseUrl } from '../src/services/api.js';

test('normalizeApiBaseUrl: correctly formats API base URLs without duplication', () => {
  // Empty / undefined / default fallbacks
  assert.equal(normalizeApiBaseUrl(''), 'http://localhost:8000/api/v1');
  assert.equal(normalizeApiBaseUrl(undefined), 'http://localhost:8000/api/v1');
  assert.equal(normalizeApiBaseUrl(null), 'http://localhost:8000/api/v1');
  assert.equal(normalizeApiBaseUrl('   '), 'http://localhost:8000/api/v1');

  // Deployed host root without /api/v1 (e.g. Render root URL)
  assert.equal(
    normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com'),
    'https://examproctor-backend-2yfp.onrender.com/api/v1'
  );
  assert.equal(
    normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com/'),
    'https://examproctor-backend-2yfp.onrender.com/api/v1'
  );

  // Deployed host already having /api/v1 (do not duplicate)
  assert.equal(
    normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com/api/v1'),
    'https://examproctor-backend-2yfp.onrender.com/api/v1'
  );
  assert.equal(
    normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com/api/v1/'),
    'https://examproctor-backend-2yfp.onrender.com/api/v1'
  );

  // Deployed host ending in /api (without /v1)
  assert.equal(
    normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com/api'),
    'https://examproctor-backend-2yfp.onrender.com/api/v1'
  );
  assert.equal(
    normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com/api/'),
    'https://examproctor-backend-2yfp.onrender.com/api/v1'
  );

  // Local development variants
  assert.equal(normalizeApiBaseUrl('http://localhost:8000'), 'http://localhost:8000/api/v1');
  assert.equal(normalizeApiBaseUrl('http://localhost:8000/'), 'http://localhost:8000/api/v1');
  assert.equal(normalizeApiBaseUrl('http://localhost:8000/api/v1'), 'http://localhost:8000/api/v1');
  assert.equal(normalizeApiBaseUrl('/api/v1'), '/api/v1');
  assert.equal(normalizeApiBaseUrl('/api'), '/api/v1');
});

test('Axios request interceptor prevents duplicate /api/v1 prefix and targets registered endpoints', async () => {
  const requestsMade = [];

  // Create an axios instance with the same configuration and interceptors as api.js
  const testClient = axios.create({
    baseURL: 'https://examproctor-backend-2yfp.onrender.com/api/v1',
    adapter: async (config) => {
      requestsMade.push({
        method: config.method.toUpperCase(),
        url: config.url,
        resolvedUrl: testClient.getUri(config),
        data: config.data ? JSON.parse(config.data) : undefined,
        headers: config.headers,
      });
      return {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    },
  });

  // Replicate api.js request interceptor logic
  testClient.interceptors.request.use((config) => {
    if (config.url) {
      if (config.url.startsWith('/api/v1/')) {
        config.url = config.url.replace(/^\/api\/v1/, '');
      } else if (config.url.startsWith('api/v1/')) {
        config.url = config.url.replace(/^api\/v1\/?/, '/');
      } else if (config.url === '/api/v1' || config.url === 'api/v1') {
        config.url = '/';
      }
    }
    return config;
  });

  // 1. Standard relative call
  await testClient.post('/auth/login', { identifier: 'test@examproctor.ai', password: 'pass' });
  assert.equal(
    requestsMade[0].resolvedUrl,
    'https://examproctor-backend-2yfp.onrender.com/api/v1/auth/login'
  );

  // 2. Call with explicit /api/v1/ prefix (must NOT become /api/v1/api/v1/auth/login)
  await testClient.post('/api/v1/auth/login', { identifier: 'test@examproctor.ai', password: 'pass' });
  assert.equal(
    requestsMade[1].resolvedUrl,
    'https://examproctor-backend-2yfp.onrender.com/api/v1/auth/login'
  );

  // 3. GET /auth/me
  await testClient.get('/auth/me');
  assert.equal(
    requestsMade[2].resolvedUrl,
    'https://examproctor-backend-2yfp.onrender.com/api/v1/auth/me'
  );

  // 4. POST /auth/logout
  await testClient.post('/auth/logout');
  assert.equal(
    requestsMade[3].resolvedUrl,
    'https://examproctor-backend-2yfp.onrender.com/api/v1/auth/logout'
  );
});

test('Administrator, Professor, and Student authentication requests route consistently to POST /api/v1/auth/login', async () => {
  const loginCalls = [];

  const testClient = axios.create({
    baseURL: normalizeApiBaseUrl('https://examproctor-backend-2yfp.onrender.com'),
    adapter: async (config) => {
      loginCalls.push({
        method: config.method.toUpperCase(),
        resolvedUrl: testClient.getUri(config),
        body: JSON.parse(config.data),
      });
      return {
        data: {
          data: {
            user: { role: config.data.includes('admin') ? 'admin' : (config.data.includes('prof') ? 'professor' : 'student') },
            access_token: 'fake-jwt-token',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    },
  });

  testClient.interceptors.request.use((config) => {
    if (config.url) {
      if (config.url.startsWith('/api/v1/')) {
        config.url = config.url.replace(/^\/api\/v1/, '');
      } else if (config.url.startsWith('api/v1/')) {
        config.url = config.url.replace(/^api\/v1\/?/, '/');
      } else if (config.url === '/api/v1' || config.url === 'api/v1') {
        config.url = '/';
      }
    }
    return config;
  });

  // Admin login with email
  await testClient.post('/auth/login', { identifier: 'admin@examproctor.ai', password: 'AdminPassword123!' });
  // Professor login with email
  await testClient.post('/auth/login', { identifier: 'prof.smith@university.edu', password: 'ProfPassword123!' });
  // Student login with USN
  await testClient.post('/auth/login', { identifier: '2VD23CS045', password: 'StudentPassword123!' });
  // Student login with email
  await testClient.post('/auth/login', { identifier: 'student@university.edu', password: 'StudentPassword123!' });

  assert.equal(loginCalls.length, 4);
  for (const call of loginCalls) {
    assert.equal(call.method, 'POST');
    assert.equal(call.resolvedUrl, 'https://examproctor-backend-2yfp.onrender.com/api/v1/auth/login');
    assert.ok(call.body.identifier);
    assert.ok(call.body.password);
  }
});
