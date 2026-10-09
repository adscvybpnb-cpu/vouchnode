import { apiClient } from './api.client';
import type { User } from '../types/api.types';

interface RegisterInput {
  email: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
  country: string;
  referralCode?: string;
}

interface LoginInput {
  email: string;
  password: string;
  turnstileToken: string;
}

export const authService = {
  async register(data: RegisterInput) {
    const res = await apiClient.post<{ message: string; user: User }>('/auth/register', data);
    if (res.error) throw new Error(res.error);
    const payload = res.data;
    return {
      message: payload?.message ?? 'Registration successful.',
      user: payload?.user ?? null,
    };
  },
  async login(data: LoginInput) {
    const res = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', data);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async logout() {
    await apiClient.post('/auth/logout', {});
  },
  async refreshToken() {
    const res = await apiClient.post<{ accessToken: string }>('/auth/refresh', {});
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async forgotPassword(email: string) {
    await apiClient.post('/auth/forgot-password', { email });
  },
  async resetPassword(data: any) {
    await apiClient.post('/auth/reset-password', data);
  },
  async verifyEmail(token: string) {
    await apiClient.post('/auth/verify-email', { token });
  },
  async getMe() {
    const res = await apiClient.get<User>('/users/me');
    if (res.error) throw new Error(res.error);
    return res.data!;
  }
};
