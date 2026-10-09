import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, "Password must contain uppercase, lowercase, number, and special character"),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain alphanumeric characters and underscores"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.string().length(2, 'Invalid country code').regex(/^[A-Z]{2}$/, 'Must be a valid ISO country code'),
  referralCode: z.string().trim().min(1).max(32).optional()
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email()
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
});

export const VerifyEmailSchema = z.object({
  token: z.string()
});
