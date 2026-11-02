import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, ilike } from 'drizzle-orm';
import { db, isDatabaseAvailable } from '../../db/index.js';
import {
  users,
  guestSessions,
  refreshTokens,
  passwordResetTokens,
  type User,
} from '../../db/schema/users.js';
import { env } from '../../config/env.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors/app-error.js';
import type {
  AuthTokens,
  GuestAuthResponse,
  UserAuthResponse,
  UserProfileResponse,
} from './auth.types.js';
import type {
  GuestSessionInput,
  RegisterInput,
  LoginInput,
  GoogleOAuthInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from './auth.schema.js';

interface MemoryRefreshToken {
  id: string;
  userId?: string;
  deviceId?: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
}

interface MemoryResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
}

export class AuthService {
  private googleClient: OAuth2Client;

  // In-memory fallback stores for test and offline environments
  private static memoryUsersById = new Map<string, User>();
  private static memoryUsersByEmail = new Map<string, User>();
  private static memoryUsersByUsername = new Map<string, User>();
  private static memoryUsersByGoogleId = new Map<string, User>();
  private static memoryRefreshTokens = new Map<string, MemoryRefreshToken>();
  private static memoryPasswordResetTokens = new Map<string, MemoryResetToken>();

  constructor(private fastify: FastifyInstance) {
    this.googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }

  /**
   * Helper: Find user by email (DB with In-Memory fallback)
   */
  private async findUserByEmail(email: string): Promise<User | undefined> {
    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (found) return found;
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }
    return AuthService.memoryUsersByEmail.get(email.toLowerCase());
  }

  /**
   * Helper: Find user by username (DB with In-Memory fallback, case-insensitive)
   */
  private async findUserByUsername(username: string): Promise<User | undefined> {
    const normalized = username.trim().toLowerCase();
    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.users.findFirst({
          where: ilike(users.username, normalized),
        });
        if (found) return found;
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }
    return AuthService.memoryUsersByUsername.get(normalized);
  }

  /**
   * Helper: Find user by Google ID (DB with In-Memory fallback)
   */
  private async findUserByGoogleId(googleId: string): Promise<User | undefined> {
    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.users.findFirst({
          where: eq(users.googleId, googleId),
        });
        if (found) return found;
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }
    return AuthService.memoryUsersByGoogleId.get(googleId);
  }

  /**
   * Helper: Find user by ID (DB with In-Memory fallback)
   */
  private async findUserById(id: string): Promise<User | undefined> {
    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.users.findFirst({
          where: eq(users.id, id),
        });
        if (found) return found;
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }
    return AuthService.memoryUsersById.get(id);
  }

  /**
   * Helper: Save or cache user into memory
   */
  private cacheUser(user: User): void {
    AuthService.memoryUsersById.set(user.id, user);
    if (user.email) {
      AuthService.memoryUsersByEmail.set(user.email.toLowerCase(), user);
    }
    if (user.username) {
      AuthService.memoryUsersByUsername.set(user.username.toLowerCase(), user);
    }
    if (user.googleId) {
      AuthService.memoryUsersByGoogleId.set(user.googleId, user);
    }
  }

  /**
   * Generates Access Token (short-lived JWT) and Refresh Token (long-lived)
   */
  private async issueTokens(params: {
    userId?: string;
    deviceId?: string;
    role: 'USER' | 'BRAND_REP' | 'ADMIN';
    email?: string;
    isGuest?: boolean;
  }): Promise<AuthTokens> {
    // 1. Sign Fastify JWT Access Token
    const accessToken = this.fastify.jwt.sign({
      id: params.userId || params.deviceId || '',
      email: params.email,
      role: params.role,
      isGuest: params.isGuest || false,
      deviceId: params.deviceId,
    });

    // 2. Generate cryptographically random Refresh Token
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_DAYS);

    // 3. Store Refresh Token in DB & In-Memory fallback
    const memToken: MemoryRefreshToken = {
      id: crypto.randomUUID(),
      userId: params.userId,
      deviceId: params.deviceId,
      tokenHash,
      expiresAt,
    };
    AuthService.memoryRefreshTokens.set(tokenHash, memToken);

    if (await isDatabaseAvailable()) {
      try {
        await db.insert(refreshTokens).values({
          userId: params.userId,
          deviceId: params.deviceId,
          tokenHash,
          expiresAt,
        });
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
        this.fastify.log.debug({ err }, 'Refresh token recorded in memory store');
      }
    }

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  /**
   * 1. Check Username Availability
   */
  public async checkUsernameAvailability(
    rawUsername: string,
    currentUserId?: string
  ): Promise<{ available: boolean; username: string; isCurrent?: boolean; reason?: string }> {
    const trimmed = rawUsername.trim();

    if (trimmed.length < 3) {
      return {
        available: false,
        username: trimmed,
        reason: 'Username must be at least 3 characters long',
      };
    }

    if (trimmed.length > 30) {
      return {
        available: false,
        username: trimmed,
        reason: 'Username must not exceed 30 characters',
      };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return {
        available: false,
        username: trimmed,
        reason: 'Username can only contain letters, numbers, and underscores',
      };
    }

    const reserved = [
      'admin',
      'administrator',
      'root',
      'support',
      'help',
      'system',
      'api',
      'auth',
      'settings',
      'user',
      'guest',
      'scanner',
      'foodscanner',
      'null',
      'undefined',
      'mod',
      'moderator',
    ];

    if (reserved.includes(trimmed.toLowerCase())) {
      return {
        available: false,
        username: trimmed,
        reason: 'This username is reserved',
      };
    }

    const existing = await this.findUserByUsername(trimmed);
    if (existing) {
      if (currentUserId && existing.id === currentUserId) {
        return {
          available: true,
          username: trimmed,
          isCurrent: true,
          reason: 'This is your current username',
        };
      }
      return {
        available: false,
        username: trimmed,
        reason: 'Username is already taken',
      };
    }

    return {
      available: true,
      username: trimmed,
    };
  }

  /**
   * 2. Update Username (Settings Page)
   */
  public async updateUsername(userId: string, newUsername: string): Promise<UserProfileResponse> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User account not found');
    }

    const trimmed = newUsername.trim();
    const availability = await this.checkUsernameAvailability(trimmed, userId);
    if (!availability.available) {
      throw new ConflictError(availability.reason || 'Username is not available');
    }

    // If identical to current username, return existing profile directly
    if (user.username && user.username.toLowerCase() === trimmed.toLowerCase()) {
      return this.mapUserProfile(user);
    }

    const oldUsername = user.username?.toLowerCase();
    const now = new Date();

    if (await isDatabaseAvailable()) {
      try {
        const [updated] = await db
          .update(users)
          .set({
            username: trimmed,
            updatedAt: now,
          })
          .where(eq(users.id, userId))
          .returning();
        if (updated) {
          user.username = updated.username;
          user.updatedAt = updated.updatedAt;
        }
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
        user.username = trimmed;
        user.updatedAt = now;
      }
    } else {
      user.username = trimmed;
      user.updatedAt = now;
    }

    if (oldUsername) {
      AuthService.memoryUsersByUsername.delete(oldUsername);
    }
    this.cacheUser(user);

    return this.mapUserProfile(user);
  }

  /**
   * 3. Guest Mode: Instant Device Session
   */
  public async createGuestSession(input: GuestSessionInput): Promise<GuestAuthResponse> {
    const { deviceId } = input;

    if (await isDatabaseAvailable()) {
      try {
        await db
          .insert(guestSessions)
          .values({
            deviceId,
            lastActiveAt: new Date(),
          })
          .onConflictDoUpdate({
            target: guestSessions.deviceId,
            set: { lastActiveAt: new Date() },
          });
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    const tokens = await this.issueTokens({
      deviceId,
      role: 'USER',
      isGuest: true,
    });

    return {
      isGuest: true,
      deviceId,
      tokens,
    };
  }

  /**
   * 4. Email & Password Registration (Supports optional username)
   */
  public async register(input: RegisterInput): Promise<UserAuthResponse> {
    const { email, password, username, name, guestDeviceId } = input;

    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new ConflictError('An account with this email address already exists');
    }

    let trimmedUsername: string | null = null;
    if (username) {
      trimmedUsername = username.trim();
      const availability = await this.checkUsernameAvailability(trimmedUsername);
      if (!availability.available) {
        throw new ConflictError(availability.reason || 'Username is already taken');
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let newUser: User;
    if (await isDatabaseAvailable()) {
      try {
        const [inserted] = await db
          .insert(users)
          .values({
            email,
            username: trimmedUsername,
            passwordHash,
            name: name || null,
            role: 'USER',
            isEmailVerified: false,
          })
          .returning();

        newUser = inserted;

        if (guestDeviceId && newUser) {
          await db
            .update(guestSessions)
            .set({ userId: newUser.id })
            .where(eq(guestSessions.deviceId, guestDeviceId));
        }
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
        newUser = {
          id: crypto.randomUUID(),
          email,
          username: trimmedUsername,
          phoneNumber: null,
          passwordHash,
          googleId: null,
          name: name || null,
          avatarUrl: null,
          role: 'USER',
          isEmailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } else {
      newUser = {
        id: crypto.randomUUID(),
        email,
        username: trimmedUsername,
        phoneNumber: null,
        passwordHash,
        googleId: null,
        name: name || null,
        avatarUrl: null,
        role: 'USER',
        isEmailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    this.cacheUser(newUser);

    const tokens = await this.issueTokens({
      userId: newUser.id,
      email: newUser.email || undefined,
      role: newUser.role as 'USER' | 'BRAND_REP' | 'ADMIN',
      isGuest: false,
    });

    return {
      isGuest: false,
      user: this.mapUserProfile(newUser),
      tokens,
    };
  }

  /**
   * 5. Email & Password Login
   */
  public async login(input: LoginInput): Promise<UserAuthResponse> {
    const { email, password } = input;

    const user = await this.findUserByEmail(email);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = await this.issueTokens({
      userId: user.id,
      email: user.email || undefined,
      role: user.role as 'USER' | 'BRAND_REP' | 'ADMIN',
      isGuest: false,
    });

    return {
      isGuest: false,
      user: this.mapUserProfile(user),
      tokens,
    };
  }

  /**
   * 6. Forgot Password (Anti-enumeration privacy protection)
   */
  public async requestPasswordReset(
    input: ForgotPasswordInput
  ): Promise<{ message: string; devResetToken?: string }> {
    const { email } = input;
    const user = await this.findUserByEmail(email);

    // OWASP Anti-Enumeration Principle:
    // Disclose zero information about whether an account with that email exists.
    const message =
      'If an account exists with this email address, password reset instructions have been sent.';

    if (!user) {
      return { message };
    }

    // Cryptographically secure token (64 hex characters)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

    const memToken: MemoryResetToken = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
    };
    AuthService.memoryPasswordResetTokens.set(tokenHash, memToken);

    if (await isDatabaseAvailable()) {
      try {
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt,
        });
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
        this.fastify.log.debug({ err }, 'Password reset token saved in memory store');
      }
    }

    return {
      message,
      // Only exposed in non-production environments to allow test suites and local dev to complete flow
      devResetToken: env.NODE_ENV !== 'production' ? rawToken : undefined,
    };
  }

  /**
   * 7. Reset Password with Single-Use Cryptographic Token
   */
  public async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const { token, newPassword } = input;
    if (!token) {
      throw new BadRequestError('Reset token is required');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    let storedToken: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      usedAt?: Date | null;
    } | undefined;

    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.passwordResetTokens.findFirst({
          where: eq(passwordResetTokens.tokenHash, tokenHash),
        });
        if (found) storedToken = found;
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    if (!storedToken) {
      const mem = AuthService.memoryPasswordResetTokens.get(tokenHash);
      if (mem) storedToken = mem;
    }

    if (!storedToken || storedToken.usedAt || new Date() > storedToken.expiresAt) {
      throw new BadRequestError('Invalid or expired password reset token');
    }

    const user = await this.findUserById(storedToken.userId);
    if (!user) {
      throw new BadRequestError('Invalid or expired password reset token');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    if (await isDatabaseAvailable()) {
      try {
        await db
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(eq(passwordResetTokens.id, storedToken.id));

        await db
          .update(users)
          .set({ passwordHash: newPasswordHash, updatedAt: now })
          .where(eq(users.id, user.id));

        // Revoke all active refresh tokens across all devices for this user
        await db
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    storedToken.usedAt = now;
    user.passwordHash = newPasswordHash;
    user.updatedAt = now;
    this.cacheUser(user);

    for (const [, rt] of AuthService.memoryRefreshTokens.entries()) {
      if (rt.userId === user.id && !rt.revokedAt) {
        rt.revokedAt = now;
      }
    }

    return {
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * 8. Change Password (Settings Page)
   */
  public async changePassword(
    userId: string,
    input: ChangePasswordInput
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = input;

    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User account not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestError(
        'This account was created via Google OAuth and does not have a local password set.'
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Current password does not match');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    if (await isDatabaseAvailable()) {
      try {
        await db
          .update(users)
          .set({ passwordHash: newPasswordHash, updatedAt: now })
          .where(eq(users.id, user.id));

        // Invalidate previous refresh tokens to force re-authentication across other sessions
        await db
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    user.passwordHash = newPasswordHash;
    user.updatedAt = now;
    this.cacheUser(user);

    for (const [, rt] of AuthService.memoryRefreshTokens.entries()) {
      if (rt.userId === user.id && !rt.revokedAt) {
        rt.revokedAt = now;
      }
    }

    return {
      message: 'Password has been changed successfully.',
    };
  }

  /**
   * 9. Google OAuth (Native ID Token Exchange)
   */
  public async loginWithGoogle(input: GoogleOAuthInput): Promise<UserAuthResponse> {
    const { idToken, guestDeviceId } = input;

    let googlePayload: {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    // Recognize mock/test tokens for dev and automated tests
    if (
      env.NODE_ENV !== 'production' &&
      (idToken.startsWith('mock-valid-google-token') || idToken === 'mock-token')
    ) {
      googlePayload = {
        sub: 'google-sub-mock-12345',
        email: 'mockuser@gmail.com',
        name: 'Mock Google User',
        picture: 'https://lh3.googleusercontent.com/mock.jpg',
        email_verified: true,
      };
    } else {
      try {
        const ticket = await this.googleClient.verifyIdToken({
          idToken,
          audience: env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
          throw new UnauthorizedError('Google ID token is invalid or missing required email claim');
        }
        googlePayload = payload;
      } catch (err) {
        throw new UnauthorizedError('Google token verification failed', err);
      }
    }

    const googleId = googlePayload.sub;
    const email = googlePayload.email!.toLowerCase();
    const name = googlePayload.name || null;
    const avatarUrl = googlePayload.picture || null;

    let user: User | undefined = await this.findUserByGoogleId(googleId);

    if (!user) {
      const existingByEmail = await this.findUserByEmail(email);

      if (existingByEmail) {
        if (await isDatabaseAvailable()) {
          try {
            const [updated] = await db
              .update(users)
              .set({
                googleId,
                avatarUrl: existingByEmail.avatarUrl || avatarUrl,
                isEmailVerified: true,
                updatedAt: new Date(),
              })
              .where(eq(users.id, existingByEmail.id))
              .returning();
            user = updated;
          } catch (err) {
            if (env.NODE_ENV === 'production') throw err;
            existingByEmail.googleId = googleId;
            existingByEmail.avatarUrl = existingByEmail.avatarUrl || avatarUrl;
            existingByEmail.isEmailVerified = true;
            user = existingByEmail;
          }
        } else {
          existingByEmail.googleId = googleId;
          existingByEmail.avatarUrl = existingByEmail.avatarUrl || avatarUrl;
          existingByEmail.isEmailVerified = true;
          user = existingByEmail;
        }
      } else {
        if (await isDatabaseAvailable()) {
          try {
            const [created] = await db
              .insert(users)
              .values({
                email,
                username: null,
                googleId,
                name,
                avatarUrl,
                role: 'USER',
                isEmailVerified: true,
              })
              .returning();
            user = created;
          } catch (err) {
            if (env.NODE_ENV === 'production') throw err;
            user = {
              id: crypto.randomUUID(),
              email,
              username: null,
              phoneNumber: null,
              passwordHash: null,
              googleId,
              name,
              avatarUrl,
              role: 'USER',
              isEmailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
        } else {
          user = {
            id: crypto.randomUUID(),
            email,
            username: null,
            phoneNumber: null,
            passwordHash: null,
            googleId,
            name,
            avatarUrl,
            role: 'USER',
            isEmailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
      }

      if (guestDeviceId && user && (await isDatabaseAvailable())) {
        try {
          await db
            .update(guestSessions)
            .set({ userId: user.id })
            .where(eq(guestSessions.deviceId, guestDeviceId));
        } catch (err) {
          if (env.NODE_ENV === 'production') throw err;
        }
      }
    }

    this.cacheUser(user);

    const tokens = await this.issueTokens({
      userId: user.id,
      email: user.email || undefined,
      role: user.role as 'USER' | 'BRAND_REP' | 'ADMIN',
      isGuest: false,
    });

    return {
      isGuest: false,
      user: this.mapUserProfile(user),
      tokens,
    };
  }

  /**
   * 10. Rotate Refresh Token
   */
  public async rotateRefreshToken(rawToken: string): Promise<AuthTokens> {
    if (!rawToken) {
      throw new BadRequestError('Refresh token is required');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    let stored:
      | {
          id: string;
          userId?: string | null;
          deviceId?: string | null;
          expiresAt: Date;
          revokedAt?: Date | null;
        }
      | undefined;

    if (await isDatabaseAvailable()) {
      try {
        const dbStored = await db.query.refreshTokens.findFirst({
          where: and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)),
        });
        if (dbStored) stored = dbStored;
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    if (!stored) {
      const memStored = AuthService.memoryRefreshTokens.get(tokenHash);
      if (memStored && !memStored.revokedAt) {
        stored = memStored;
      }
    }

    if (!stored || new Date() > stored.expiresAt) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Revoke old token
    if (await isDatabaseAvailable()) {
      try {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.id, stored.id));
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
        const mem = AuthService.memoryRefreshTokens.get(tokenHash);
        if (mem) mem.revokedAt = new Date();
      }
    } else {
      const mem = AuthService.memoryRefreshTokens.get(tokenHash);
      if (mem) mem.revokedAt = new Date();
    }

    let userRole: 'USER' | 'BRAND_REP' | 'ADMIN' = 'USER';
    let userEmail: string | undefined;

    if (stored.userId) {
      const user = await this.findUserById(stored.userId);
      if (user) {
        userRole = user.role as 'USER' | 'BRAND_REP' | 'ADMIN';
        userEmail = user.email || undefined;
      }
    }

    return await this.issueTokens({
      userId: stored.userId || undefined,
      deviceId: stored.deviceId || undefined,
      role: userRole,
      email: userEmail,
      isGuest: !stored.userId,
    });
  }

  /**
   * 11. Logout / Revoke Token
   */
  public async logout(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    if (await isDatabaseAvailable()) {
      try {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.tokenHash, tokenHash));
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
        const mem = AuthService.memoryRefreshTokens.get(tokenHash);
        if (mem) mem.revokedAt = new Date();
      }
    } else {
      const mem = AuthService.memoryRefreshTokens.get(tokenHash);
      if (mem) mem.revokedAt = new Date();
    }
  }

  /**
   * 12. Retrieve User Profile by ID
   */
  public async getUserProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.findUserById(userId);

    if (!user) {
      throw new NotFoundError('User account not found');
    }

    return this.mapUserProfile(user);
  }

  private mapUserProfile(user: User): UserProfileResponse {
    return {
      id: user.id,
      username: user.username || null,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role as 'USER' | 'BRAND_REP' | 'ADMIN',
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }
}
