import { ErrorHandler } from '../errors/ErrorHandler';

export function encodeMessageCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt, id })).toString(
    'base64url'
  );
}

export function decodeMessageCursor(cursor: string): {
  createdAt: string;
  id: string;
} {
  try {
    if (cursor.length > 512) throw new Error();
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      value.v !== 1 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(value.createdAt) ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.id) ||
      !Number.isFinite(Date.parse(value.createdAt + 'Z'))
    )
      throw new Error();
    return { createdAt: value.createdAt, id: value.id };
  } catch {
    throw ErrorHandler.invalidInput('Invalid message history cursor');
  }
}
