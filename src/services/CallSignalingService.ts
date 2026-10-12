import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { Client } from 'pg';
import { AppDataSource } from '../data-source';
import { Call, CallStatus } from '../entities/Call';
import { CallSignal } from '../entities/CallSignal';
import { CallsModel, callsModel, callView } from '../models/calls.model';
import { getUserFromRequest } from '../auth/getUserFromRequest';
import { boundedCallSetting, uuidPattern } from '../utils/callPolicy';
import { ErrorHandler } from '../errors/ErrorHandler';

type Session = {
  ws: WebSocket;
  userId: string;
  id: string;
  token: string;
  exp: number;
  alive: boolean;
};
export class CallSignalingService extends EventEmitter {
  readonly instanceId = randomUUID();
  private wss?: WebSocket.Server;
  private listener?: Client;
  private sessions = new Map<WebSocket, Session>();
  private heartbeat?: NodeJS.Timeout;
  private sweeping?: NodeJS.Timeout;
  private retry?: NodeJS.Timeout;
  private stopping = false;
  private sweepingNow = false;
  constructor(private model: CallsModel = callsModel) {
    super();
  }

  async start(
    port = Number(process.env.CALL_SIGNALING_PORT || 4002),
    host = process.env.CALL_SIGNALING_HOST || '127.0.0.1'
  ): Promise<number> {
    if (this.wss) throw new Error('Call signaling is already started');
    const heartbeat = boundedCallSetting('CALL_HEARTBEAT_MS', 5000, 250, 15000);
    if (
      boundedCallSetting('CALL_CONNECTION_LEASE_MS', 30000, 1000, 120000) <=
      heartbeat * 2
    )
      throw new Error(
        'CALL_CONNECTION_LEASE_MS must exceed twice CALL_HEARTBEAT_MS'
      );
    this.stopping = false;
    await this.startListener();
    this.wss = new WebSocket.Server({
      port,
      host,
      maxPayload: 98304,
      perMessageDeflate: false,
      verifyClient: (info) => {
        const allowed = (
          process.env.CALL_ALLOWED_ORIGINS || 'null,http://localhost:4000'
        )
          .split(',')
          .map((value) => value.trim());
        return !info.origin || allowed.includes(info.origin);
      },
    });
    this.wss.on('connection', (ws) => this.connect(ws));
    this.wss.on('error', (error) =>
      console.error('[CallSignaling] Server error:', error.message)
    );
    await new Promise<void>((resolve, reject) => {
      this.wss.once('listening', resolve);
      this.wss.once('error', reject);
    });
    this.heartbeat = setInterval(
      () => {
        void this.tickHeartbeat();
      },
      boundedCallSetting('CALL_HEARTBEAT_MS', 5000, 250, 15000)
    );
    this.sweeping = setInterval(() => {
      if (this.sweepingNow) return;
      this.sweepingNow = true;
      void this.model
        .sweep()
        .catch(() => this.closeAll(1013, 'Call database unavailable'))
        .finally(() => {
          this.sweepingNow = false;
        });
    }, 1000);
    this.heartbeat.unref();
    this.sweeping.unref();
    await this.model.sweep();
    return (this.wss.address() as any).port;
  }
  private async startListener(): Promise<void> {
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
    this.listener = client;
    let lost = false;
    const disconnected = () => {
      if (lost || this.stopping) return;
      lost = true;
      this.closeAll(1013, 'Call signaling reconnecting');
      void client.end().catch(() => {});
      this.retry = setTimeout(() => {
        void this.startListener().catch(() => {});
      }, 2000);
      this.retry.unref();
    };
    client.on('error', disconnected);
    client.on('end', disconnected);
    client.on('notification', (message) => {
      try {
        const event = JSON.parse(message.payload);
        void this.deliverEvent(event).catch(() =>
          this.closeAll(1013, 'Call signaling unavailable')
        );
      } catch {
        /* Invalid database event. */
      }
    });
    try {
      await client.connect();
      await client.query('LISTEN therev_calls_v1');
      for (const session of this.sessions.values()) await this.sync(session);
    } catch (error) {
      disconnected();
      throw error;
    }
  }
  private valid(session: Session): boolean {
    const user = getUserFromRequest({
      headers: { authorization: 'Bearer ' + session.token },
    });
    return user?.userId === session.userId && session.exp * 1000 > Date.now();
  }
  private send(ws: WebSocket, message: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 262144) {
      ws.close(1013, 'Slow signaling consumer');
      return;
    }
    ws.send(JSON.stringify(message));
  }
  private connect(ws: WebSocket): void {
    if (this.wss.clients.size > 1000) {
      ws.close(1013, 'Too many signaling connections');
      return;
    }
    const timer = setTimeout(
      () => ws.close(1008, 'Authentication required'),
      5000
    );
    timer.unref();
    let chain = Promise.resolve();
    let frames = 0,
      windowStart = Date.now();
    ws.on('pong', () => {
      const session = this.sessions.get(ws);
      if (session) session.alive = true;
    });
    ws.on('error', () => {});
    ws.on('message', (data, binary) => {
      if (Date.now() - windowStart > 1000) {
        frames = 0;
        windowStart = Date.now();
      }
      if (++frames > 100 || binary) {
        ws.close(1008, 'Invalid signaling traffic');
        return;
      }
      chain = chain
        .then(async () => {
          const message = JSON.parse(data.toString());
          if (!message || typeof message !== 'object' || Array.isArray(message))
            throw ErrorHandler.invalidInput('Invalid signaling message');
          let session = this.sessions.get(ws);
          if (!session) {
            if (
              message.type !== 'auth' ||
              typeof message.token !== 'string' ||
              message.token.length > 8192 ||
              message.userId ||
              message.fromUserId
            )
              throw ErrorHandler.notAuthenticated();
            const user: any = getUserFromRequest({
              headers: { authorization: 'Bearer ' + message.token },
            });
            if (
              !user ||
              !uuidPattern.test(user.userId) ||
              !Number.isFinite(user.exp) ||
              user.exp * 1000 <= Date.now()
            )
              throw ErrorHandler.notAuthenticated();
            const connection = await this.model.registerConnection(
              user.userId,
              this.instanceId,
              user.exp,
              message.resumeConnectionId
            );
            session = {
              ws,
              id: connection.id,
              userId: user.userId,
              token: message.token,
              exp: user.exp,
              alive: true,
            };
            // A socket that closes during authentication must not leave a live lease.
            if (ws.readyState !== WebSocket.OPEN) {
              await this.model.disconnectConnection(
                connection.id,
                this.instanceId
              );
              return;
            }
            this.sessions.set(ws, session);
            clearTimeout(timer);
            this.send(ws, {
              type: 'ready',
              connectionId: session.id,
              userId: session.userId,
            });
            await this.sync(session);
            return;
          }
          if (!this.valid(session)) {
            ws.close(1008, 'Session expired');
            return;
          }
          if (message.fromUserId && message.fromUserId !== session.userId)
            throw ErrorHandler.forbidden('Signaling identity mismatch');
          await this.handleMessage(session, message);
        })
        .catch((error) => {
          this.send(ws, {
            type: 'error',
            message:
              error instanceof SyntaxError
                ? 'Invalid signaling JSON'
                : error.message,
          });
          if (!this.sessions.has(ws)) ws.close(1008, 'Authentication failed');
        });
    });
    ws.on('close', () => {
      clearTimeout(timer);
      const session = this.sessions.get(ws);
      this.sessions.delete(ws);
      if (session)
        void this.model
          .disconnectConnection(session.id, this.instanceId)
          .catch(() => {});
    });
  }
  private async handleMessage(session: Session, message: any): Promise<void> {
    const requestId =
      typeof message.requestId === 'string' && message.requestId.length <= 64
        ? message.requestId
        : undefined;
    if (message.type === 'call:sync') {
      await this.sync(session);
      return;
    }
    if (message.type === 'call:signal-ack') {
      await this.model.acknowledgeSignal(
        message.signalId,
        session.userId,
        session.id
      );
      return;
    }
    let call: Call;
    if (message.type === 'call:initiate') {
      call = await this.model.initiateCall(
        session.userId,
        message.payload?.calleeId,
        message.payload?.isVideo === true,
        session.id
      );
    } else {
      if (!uuidPattern.test(message.callId || ''))
        throw ErrorHandler.invalidInput('Invalid call identifier');
      const existing = await this.model.getCall(message.callId, session.userId);
      const peer =
        existing.callerId === session.userId
          ? existing.calleeId
          : existing.callerId;
      if (message.toUserId && message.toUserId !== peer)
        throw ErrorHandler.forbidden(
          'Signals can only target the other call participant'
        );
      switch (message.type) {
        case 'call:accept':
          call = await this.model.acceptCall(
            message.callId,
            session.userId,
            session.id
          );
          break;
        case 'call:decline':
          call = await this.model.declineCall(message.callId, session.userId);
          break;
        case 'call:cancel':
          call = await this.model.cancelCall(message.callId, session.userId);
          break;
        case 'call:end':
          call = await this.model.endCall(message.callId, session.userId);
          break;
        case 'call:controls':
          call = await this.model.updateControls(
            message.callId,
            session.userId,
            message.payload?.muted,
            message.payload?.videoEnabled
          );
          break;
        case 'call:offer':
        case 'call:answer':
        case 'call:ice-candidate':
          await this.model.sendSignal(
            message.callId,
            session.userId,
            message.type,
            message.payload,
            session.id
          );
          this.send(session.ws, {
            type: 'call:result',
            requestId,
            callId: message.callId,
          });
          return;
        default:
          throw ErrorHandler.invalidInput('Unsupported call operation');
      }
    }
    this.send(session.ws, {
      type: 'call:result',
      requestId,
      call: callView(call),
    });
  }
  private async deliverEvent(event: {
    kind: string;
    id: string;
  }): Promise<void> {
    if (!uuidPattern.test(event.id || '')) return;
    if (event.kind === 'state') {
      const call = await AppDataSource.getRepository(Call).findOne({
        where: { id: event.id },
      });
      if (!call) return;
      for (const session of this.sessions.values()) {
        if (!this.valid(session)) {
          session.ws.close(1008, 'Session expired');
          continue;
        }
        if (
          session.userId !== call.callerId &&
          session.userId !== call.calleeId
        )
          continue;
        this.send(session.ws, {
          type:
            call.status === CallStatus.RINGING &&
            session.userId === call.calleeId
              ? 'call:incoming'
              : 'call:state',
          call: callView(call),
        });
      }
    } else if (event.kind === 'signal') {
      const signal = await AppDataSource.getRepository(CallSignal).findOne({
        where: { id: event.id },
      });
      if (!signal || signal.expiresAt.getTime() <= Date.now()) return;
      for (const session of this.sessions.values()) {
        if (
          session.id !== signal.toConnectionId ||
          session.userId !== signal.toUserId ||
          !this.valid(session)
        )
          continue;
        const call = await this.model.getCall(signal.callId, session.userId);
        if (call.status === CallStatus.ACTIVE) this.sendSignal(session, signal);
      }
    }
  }
  private sendSignal(session: Session, signal: CallSignal): void {
    this.send(session.ws, {
      type: signal.type,
      signalId: signal.id,
      callId: signal.callId,
      fromUserId: signal.fromUserId,
      payload: signal.payload,
    });
  }
  private async sync(session: Session): Promise<void> {
    if (!this.valid(session)) {
      session.ws.close(1008, 'Session expired');
      return;
    }
    const call = await this.model.getActiveCall(session.userId);
    this.send(session.ws, {
      type: 'call:snapshot',
      call: call ? callView(call) : null,
    });
    for (const signal of await this.model.pendingSignals(
      session.userId,
      session.id
    ))
      this.sendSignal(session, signal);
  }
  private async tickHeartbeat(): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        if (
          !session.alive ||
          !this.valid(session) ||
          !(await this.model.heartbeatConnection(
            session.id,
            this.instanceId,
            session.exp
          ))
        ) {
          session.ws.terminate();
          continue;
        }
        session.alive = false;
        session.ws.ping();
      } catch {
        session.ws.close(1013, 'Call database unavailable');
      }
    }
  }
  private closeAll(code: number, reason: string): void {
    for (const ws of this.wss?.clients || []) ws.close(code, reason);
  }
  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    clearInterval(this.sweeping);
    const sessions = [...this.sessions.values()];
    this.closeAll(1001, 'Call server shutting down');
    for (const session of sessions) {
      await this.model
        .disconnectConnection(session.id, this.instanceId)
        .catch(() => {});
      session.ws.terminate();
    }
    this.sessions.clear();
    if (this.wss)
      await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    this.wss = undefined;
    await this.listener?.end().catch(() => {});
  }
}
export const callSignalingService = new CallSignalingService();
