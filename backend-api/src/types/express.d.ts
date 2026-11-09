import 'express';

export interface AuthUser {
  id: string;
  email: string;
  role: 'student' | 'advisor' | 'admin';
  mustChangePassword: boolean;
  tokenId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      correlationId: string;
      requestStartedAt: number;
    }
  }
}
