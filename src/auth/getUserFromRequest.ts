import jwt from 'jsonwebtoken';
import { UserRole } from '../graphql/enums/UserRole';

export function getUserFromRequest(request: any) {
  // Handle different header formats from graphql-yoga
  const headers = request.headers;
  const authHeader =
    headers?.authorization ||
    headers?.Authorization ||
    headers?.get?.('authorization');

  if (!authHeader) {
    console.log(
      '[Auth] No auth header, headers keys:',
      headers ? Object.keys(headers) : 'none'
    );
    return undefined;
  }

  const token = authHeader.replace('Bearer ', '');

  console.log('[Auth] Token found:', token.substring(0, 30) + '...');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as {
      userId: string;
      role: UserRole;
    };
    console.log('[Auth] Decoded:', decoded);
    return decoded;
  } catch (err: any) {
    console.log('[Auth] JWT verify error:', err.message);
    return undefined;
  }
}
