import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import {
  guestSessionSchema,
  registerSchema,
  loginSchema,
  googleOAuthSchema,
  refreshTokenSchema,
  usernameAvailabilitySchema,
  updateUsernameSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './auth.schema.js';
import { env } from '../../config/env.js';
import { BadRequestError, UnauthorizedError } from '../../common/errors/app-error.js';

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  private setRefreshTokenCookie(reply: FastifyReply, refreshToken: string): void {
    reply.setCookie('refresh_token', refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60,
    });
  }

  /**
   * GET /api/v1/auth/username-available?username=xyz
   * Checks if a username is available (real-time validation for register & settings)
   */
  public handleCheckUsername = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = usernameAvailabilitySchema.parse(request.query);
    const currentUserId = request.user && !request.user.isGuest ? request.user.id : undefined;
    const result = await this.authService.checkUsernameAvailability(input.username, currentUserId);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  /**
   * PATCH /api/v1/auth/me/username (Protected Route)
   * Updates authenticated user's unique username from settings
   */
  public handleUpdateUsername = async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = request.user;
    if (!userPayload || userPayload.isGuest) {
      throw new UnauthorizedError('Unauthorized: Registered user required to set a username');
    }

    const input = updateUsernameSchema.parse(request.body);
    const updatedProfile = await this.authService.updateUsername(userPayload.id, input.username);

    return reply.status(200).send({
      success: true,
      message: 'Username updated successfully',
      data: {
        user: updatedProfile,
      },
    });
  };

  /**
   * POST /api/v1/auth/forgot-password
   * Dispatches reset token with anti-enumeration protection
   */
  public handleForgotPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = forgotPasswordSchema.parse(request.body);
    const result = await this.authService.requestPasswordReset(input);
    return reply.status(200).send({
      success: true,
      message: result.message,
      ...(result.devResetToken ? { data: { devResetToken: result.devResetToken } } : {}),
    });
  };

  /**
   * POST /api/v1/auth/reset-password
   * Consumes single-use reset token and updates password
   */
  public handleResetPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = resetPasswordSchema.parse(request.body);
    const result = await this.authService.resetPassword(input);
    return reply.status(200).send({
      success: true,
      message: result.message,
    });
  };

  /**
   * POST /api/v1/auth/change-password (Protected Route)
   * Changes password for authenticated user in settings
   */
  public handleChangePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = request.user;
    if (!userPayload || userPayload.isGuest) {
      throw new UnauthorizedError('Unauthorized: Guests cannot change passwords');
    }

    const input = changePasswordSchema.parse(request.body);
    const result = await this.authService.changePassword(userPayload.id, input);
    return reply.status(200).send({
      success: true,
      message: result.message,
    });
  };

  /**
   * POST /api/v1/auth/guest
   */
  public handleGuest = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = guestSessionSchema.parse(request.body);
    const result = await this.authService.createGuestSession(input);
    this.setRefreshTokenCookie(reply, result.tokens.refreshToken);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  /**
   * POST /api/v1/auth/register
   */
  public handleRegister = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = registerSchema.parse(request.body);
    const result = await this.authService.register(input);
    this.setRefreshTokenCookie(reply, result.tokens.refreshToken);
    return reply.status(201).send({
      success: true,
      message: 'Account registered successfully',
      data: result,
    });
  };

  /**
   * POST /api/v1/auth/login
   */
  public handleLogin = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = loginSchema.parse(request.body);
    const result = await this.authService.login(input);
    this.setRefreshTokenCookie(reply, result.tokens.refreshToken);
    return reply.status(200).send({
      success: true,
      message: 'Login successful',
      data: result,
    });
  };

  /**
   * POST /api/v1/auth/google
   */
  public handleGoogle = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = googleOAuthSchema.parse(request.body);
    const result = await this.authService.loginWithGoogle(input);
    this.setRefreshTokenCookie(reply, result.tokens.refreshToken);
    return reply.status(200).send({
      success: true,
      message: 'Google authentication successful',
      data: result,
    });
  };

  /**
   * POST /api/v1/auth/refresh
   */
  public handleRefresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshTokenSchema.parse(request.body || {});
    const cookieToken = request.cookies.refresh_token;
    const token = body.refreshToken || cookieToken;

    if (!token) {
      throw new BadRequestError('Refresh token must be provided via cookie or request body');
    }

    const tokens = await this.authService.rotateRefreshToken(token);
    this.setRefreshTokenCookie(reply, tokens.refreshToken);
    return reply.status(200).send({
      success: true,
      data: { tokens },
    });
  };

  /**
   * POST /api/v1/auth/logout
   */
  public handleLogout = async (request: FastifyRequest, reply: FastifyReply) => {
    const cookieToken = request.cookies.refresh_token;
    if (cookieToken) {
      await this.authService.logout(cookieToken);
    }
    reply.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  };

  /**
   * GET /api/v1/auth/me (Protected Route)
   */
  public handleMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = request.user;
    if (!userPayload) {
      throw new UnauthorizedError('Unauthorized');
    }

    if (userPayload.isGuest) {
      return reply.status(200).send({
        success: true,
        data: {
          isGuest: true,
          deviceId: userPayload.deviceId,
          role: userPayload.role,
        },
      });
    }

    const profile = await this.authService.getUserProfile(userPayload.id);
    return reply.status(200).send({
      success: true,
      data: {
        isGuest: false,
        user: profile,
      },
    });
  };
}
