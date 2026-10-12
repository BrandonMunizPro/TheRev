import { EventEmitter } from 'events';
import { Client } from 'pg';
import { EntityManager } from 'typeorm';
import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { getUserFromRequest } from '../auth/getUserFromRequest';
import { MessagingAccess } from './MessagingAccess';

export type MessageEvent = {
  kind: 'created' | 'updated' | 'deleted' | 'read' | 'membership';
  messageId?: string;
  channelId?: string;
  serverId?: string;
  userIds?: string[];
};

// NOTIFY is committed with the message transaction and reaches every API instance.
export async function publishMessageEvent(
  manager: EntityManager,
  event: MessageEvent
): Promise<void> {
  await manager.query('SELECT pg_notify($1, $2)', [
    'therev_messages_v1',
    JSON.stringify(event),
  ]);
}

export class MessageEventsService extends EventEmitter {
  private client?: Client;
  private stopped = false;
  private reconnect?: NodeJS.Timeout;
  private access = new MessagingAccess();
  private clients = 0;

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  async start(): Promise<void> {
    this.stopped = false;
    const options = AppDataSource.options as any;
    const client = new Client({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
      ssl: options.ssl,
      connectionTimeoutMillis: 5000,
    });
    this.client = client;
    let lost = false;
    const disconnected = () => {
      if (lost || this.stopped) return;
      lost = true;
      void client.end().catch(() => {});
      this.reconnect = setTimeout(() => {
        void this.start().catch(() => {});
      }, 2000);
      this.reconnect.unref();
    };
    client.on('error', disconnected);
    client.on('end', disconnected);
    client.on('notification', (message) => {
      try {
        this.emit('change', JSON.parse(message.payload));
      } catch {
        /* Ignore malformed notifications. */
      }
    });
    try {
      await client.connect();
      await client.query('LISTEN therev_messages_v1');
      this.emit('resync');
    } catch (error) {
      disconnected();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.reconnect);
    this.emit('shutdown');
    await this.client?.end().catch(() => {});
  }

  async canReceive(userId: string, event: MessageEvent): Promise<boolean> {
    try {
      if (event.kind === 'read' || event.kind === 'membership')
        return !!event.userIds?.includes(userId);
      if (event.channelId) {
        const channel = await this.access.channel(userId, event.channelId);
        return channel.serverId === event.serverId;
      }
      return !!event.userIds?.includes(userId);
    } catch {
      return false;
    }
  }

  connect = (req: Request, res: Response): void => {
    const user = getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (this.clients >= 1000) {
      res.status(503).end();
      return;
    }
    this.clients++;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let closed = false;
    let pending = 0;
    const send = (event: string, data: unknown) => {
      if (
        !closed &&
        !res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      )
        close();
    };
    const change = async (event: MessageEvent) => {
      if (++pending > 100) {
        pending--;
        close();
        return;
      }
      try {
        if (!getUserFromRequest(req)) {
          close();
          return;
        }
        if (await this.canReceive(user.userId, event)) send('message', event);
      } finally {
        pending--;
      }
    };
    const resync = () => send('ready', {});
    const heartbeat = setInterval(() => {
      if (!getUserFromRequest(req)) close();
      else send('heartbeat', {});
    }, 15000);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.off('change', change);
      this.off('resync', resync);
      this.off('shutdown', close);
      this.clients--;
      res.end();
    };
    this.on('change', change);
    this.on('resync', resync);
    this.on('shutdown', close);
    res.on('close', close);
    send('ready', {});
  };
}

export const messageEventsService = new MessageEventsService();
