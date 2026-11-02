export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface UserProfileResponse {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'BRAND_REP' | 'ADMIN';
  isEmailVerified: boolean;
  createdAt: Date;
}

export interface GuestAuthResponse {
  isGuest: true;
  deviceId: string;
  tokens: AuthTokens;
}

export interface UserAuthResponse {
  isGuest: false;
  user: UserProfileResponse;
  tokens: AuthTokens;
}

export type AuthResponse = GuestAuthResponse | UserAuthResponse;
