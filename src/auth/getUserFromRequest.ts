import jwt from 'jsonwebtoken';
import { UserRole } from '../graphql/enums/UserRole';

export function getUserFromRequest(request: any) {
  const headers = request.headers;

  if (!headers) {
    console.log('[Auth] No headers in request');
    return undefined;
  }

  // Handle Headers object (graphql-yoga uses this)
  let authHeader: string | null = null;

  if (typeof headers.get === 'function') {
    // It's a Headers object
    authHeader = headers.get('authorization');
  } else if (typeof headers.authorization === 'string') {
    authHeader = headers.authorization;
  } else if (typeof headers.Authorization === 'string') {
    authHeader = headers.Authorization;
  }

  if (!authHeader) {
    console.log('[Auth] No auth header found in request');
    return undefined;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as {
      userId: string;
      role: UserRole;
    };
    return decoded;
  } catch (err: any) {
    console.log('[Auth] JWT verify error:', err.message);
    return undefined;
  }
}
