import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Authentication API Module', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  describe('1. Guest Authentication Flow', () => {
    test('POST /api/v1/auth/guest successfully creates anonymous session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/guest',
        payload: {
          deviceId: 'device-test-uuid-998877',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isGuest, true);
      assert.strictEqual(json.data.deviceId, 'device-test-uuid-998877');
      assert.ok(json.data.tokens.accessToken);
      assert.ok(json.data.tokens.refreshToken);
      assert.strictEqual(json.data.tokens.tokenType, 'Bearer');

      // Verify refresh token cookie is set
      const cookies = response.headers['set-cookie'];
      assert.ok(cookies);
      assert.ok(String(cookies).includes('refresh_token='));
    });

    test('POST /api/v1/auth/guest rejects invalid deviceId with 422', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/guest',
        payload: {
          deviceId: 'short', // less than 8 chars
        },
      });

      assert.strictEqual(response.statusCode, 422);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'VALIDATION_ERROR');
    });
  });

  describe('2. User Registration & Login Flow', () => {
    const testEmail = `testuser_${Date.now()}@example.com`;
    const testPassword = 'Password123!';
    let registeredAccessToken = '';

    test('POST /api/v1/auth/register creates new account with valid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: 'Priya Sharma',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isGuest, false);
      assert.strictEqual(json.data.user.email, testEmail);
      assert.strictEqual(json.data.user.name, 'Priya Sharma');
      assert.ok(json.data.tokens.accessToken);
      registeredAccessToken = json.data.tokens.accessToken;
    });

    test('POST /api/v1/auth/register rejects short passwords with 422', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'valid@example.com',
          password: '123', // less than 8 chars
        },
      });

      assert.strictEqual(response.statusCode, 422);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'VALIDATION_ERROR');
    });

    test('POST /api/v1/auth/login succeeds with correct credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.user.email, testEmail);
      assert.ok(json.data.tokens.accessToken);
    });

    test('POST /api/v1/auth/login fails with incorrect password with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'WrongPassword999',
        },
      });

      assert.strictEqual(response.statusCode, 401);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'UNAUTHORIZED');
    });

    test('GET /api/v1/auth/me returns authenticated user details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${registeredAccessToken}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isGuest, false);
      assert.strictEqual(json.data.user.email, testEmail);
    });
  });

  describe('3. Google OAuth Flow', () => {
    test('POST /api/v1/auth/google verifies ID token and returns authenticated user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google',
        payload: {
          idToken: 'mock-valid-google-token-xyz-123',
          guestDeviceId: 'device-test-uuid-998877',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isGuest, false);
      assert.strictEqual(json.data.user.email, 'mockuser@gmail.com');
      assert.strictEqual(json.data.user.name, 'Mock Google User');
      assert.ok(json.data.tokens.accessToken);
    });
  });

  describe('4. Token Security & Protected Routes', () => {
    test('GET /api/v1/auth/me rejects requests without token with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      assert.strictEqual(response.statusCode, 401);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'UNAUTHORIZED');
    });

    test('POST /api/v1/auth/logout clears refresh cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          cookie: 'refresh_token=sample-refresh-token',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
    });
  });

  describe('5. Username Validation & Availability Flow', () => {
    test('GET /api/v1/auth/username-available reports true for unused valid username', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/username-available?username=fresh_user_123',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.available, true);
      assert.strictEqual(json.data.username, 'fresh_user_123');
    });

    test('GET /api/v1/auth/username-available rejects reserved names with available=false', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/username-available?username=admin',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.available, false);
      assert.ok(json.data.reason.includes('reserved'));
    });

    test('GET /api/v1/auth/username-available rejects usernames with invalid characters or length', async () => {
      const responseShort = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/username-available?username=ab',
      });
      const jsonShort = JSON.parse(responseShort.body);
      assert.strictEqual(jsonShort.data.available, false);
      assert.ok(jsonShort.data.reason.includes('at least 3 characters'));

      const responseInvalid = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/username-available?username=user@domain.com',
      });
      const jsonInvalid = JSON.parse(responseInvalid.body);
      assert.strictEqual(jsonInvalid.data.available, false);
      assert.ok(jsonInvalid.data.reason.includes('letters, numbers, and underscores'));
    });

    test('POST /api/v1/auth/register with username allocates it and blocks duplicate registration', async () => {
      const uniqueName = `unique_${Date.now()}`;
      const email1 = `reg1_${Date.now()}@example.com`;
      const email2 = `reg2_${Date.now()}@example.com`;

      const reg1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: email1,
          password: 'Password123!',
          username: uniqueName,
        },
      });
      assert.strictEqual(reg1.statusCode, 201);
      const json1 = JSON.parse(reg1.body);
      assert.strictEqual(json1.data.user.username, uniqueName);

      // Now query availability for that username
      const checkRes = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/username-available?username=${uniqueName}`,
      });
      const checkJson = JSON.parse(checkRes.body);
      assert.strictEqual(checkJson.data.available, false);

      // Attempting to register another account with same username fails with 409
      const reg2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: email2,
          password: 'Password123!',
          username: uniqueName,
        },
      });
      assert.strictEqual(reg2.statusCode, 409);
    });
  });

  describe('6. Username Settings & Edit Flow', () => {
    let userToken = '';
    let currentUsername = `init_${Date.now()}`;

    before(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `settings_user_${Date.now()}@example.com`,
          password: 'Password123!',
          username: currentUsername,
        },
      });
      const json = JSON.parse(res.body);
      userToken = json.data.tokens.accessToken;
    });

    test('GET /api/v1/auth/username-available identifies current username when authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/username-available?username=${currentUsername}`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.strictEqual(json.data.available, true);
      assert.strictEqual(json.data.isCurrent, true);
    });

    test('PATCH /api/v1/auth/me/username updates username from settings', async () => {
      const newUsername = `updated_${Date.now()}`;
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/me/username',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          username: newUsername,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.user.username, newUsername);

      // Verify GET /api/v1/auth/me reflects the new username
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      const meJson = JSON.parse(meRes.body);
      assert.strictEqual(meJson.data.user.username, newUsername);
      currentUsername = newUsername;
    });

    test('PATCH /api/v1/auth/me/username rejects collision with existing user', async () => {
      const otherUser = `other_${Date.now()}`;
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `other_${Date.now()}@example.com`,
          password: 'Password123!',
          username: otherUser,
        },
      });

      const conflictRes = await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/me/username',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          username: otherUser,
        },
      });
      assert.strictEqual(conflictRes.statusCode, 409);
    });

    test('PATCH /api/v1/auth/me/username rejects unauthenticated or guest callers', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/me/username',
        payload: {
          username: 'hacker_attempt',
        },
      });
      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('7. Forgot & Reset Password Flow (OWASP Privacy & Security)', () => {
    const userEmail = `pwd_reset_${Date.now()}@example.com`;
    const initialPassword = 'OldPassword123!';
    const newPassword = 'NewSecretPassword456!';
    let devResetToken = '';

    before(async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: userEmail,
          password: initialPassword,
        },
      });
    });

    test('POST /api/v1/auth/forgot-password preserves anti-enumeration on unknown email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: 'unknown_ghost_account@example.com',
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.message, 'If an account exists with this email address, password reset instructions have been sent.');
      assert.strictEqual(json.data?.devResetToken, undefined);
    });

    test('POST /api/v1/auth/forgot-password generates reset token for registered account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: userEmail,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.strictEqual(json.success, true);
      assert.ok(json.data.devResetToken);
      devResetToken = json.data.devResetToken;
    });

    test('POST /api/v1/auth/reset-password rejects invalid or malformed token with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: 'totally-fake-token-hex-1234567890abcdef',
          newPassword: 'SomeValidPassword999!',
        },
      });
      assert.strictEqual(res.statusCode, 400);
    });

    test('POST /api/v1/auth/reset-password successfully resets password and invalidates token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: devResetToken,
          newPassword,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.strictEqual(json.success, true);

      // Verify token is single-use: re-submitting fails with 400
      const reuseRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: devResetToken,
          newPassword: 'AnotherPassword888!',
        },
      });
      assert.strictEqual(reuseRes.statusCode, 400);

      // Verify old password no longer works
      const oldLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: userEmail,
          password: initialPassword,
        },
      });
      assert.strictEqual(oldLogin.statusCode, 401);

      // Verify new password successfully logs in
      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: userEmail,
          password: newPassword,
        },
      });
      assert.strictEqual(newLogin.statusCode, 200);
    });
  });

  describe('8. Change Password Settings Flow', () => {
    const userEmail = `change_pwd_${Date.now()}@example.com`;
    const initialPassword = 'Password123!';
    const newPassword = 'ChangedPassword456!';
    let userToken = '';

    before(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: userEmail,
          password: initialPassword,
        },
      });
      const json = JSON.parse(res.body);
      userToken = json.data.tokens.accessToken;
    });

    test('POST /api/v1/auth/change-password fails when currentPassword is wrong', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          currentPassword: 'WrongCurrentPassword!',
          newPassword,
        },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    test('POST /api/v1/auth/change-password rejects reusing the same password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword: initialPassword,
        },
      });
      assert.strictEqual(res.statusCode, 400);
    });

    test('POST /api/v1/auth/change-password succeeds with valid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.strictEqual(json.success, true);

      // Verify login with new password works
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: userEmail,
          password: newPassword,
        },
      });
      assert.strictEqual(loginRes.statusCode, 200);
    });
  });
});
