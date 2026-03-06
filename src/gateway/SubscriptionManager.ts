import { EventEmitter } from 'events';

interface WS {
  readyState: number;
  send(data: string): void;
  close(): void;
}

const WebSocket = require('ws');

export interface Subscription {
  id: string;
  query: string;
  variables?: Record<string, any>;
  emitter: string;
  connectionId: string;
  createdAt: number;
  lastPing: number;
}

export interface SubscriptionMessage {
  type:
    | 'connection_ack'
    | 'connection_init'
    | 'start'
    | 'stop'
    | 'connection_terminate'
    | 'data'
    | 'error'
    | 'complete'
    | 'ping'
    | 'pong';
  id?: string;
  payload?: any;
}

export class SubscriptionManager extends EventEmitter {
  private subscriptions: Map<string, Subscription>;
  private connections: Map<string, Set<string>>;
  private emitters: Map<string, Set<string>>;
  private wsServer: any = null;
  private port: number;

  constructor(port: number = 4001) {
    super();
    this.subscriptions = new Map();
    this.connections = new Map();
    this.emitters = new Map();
    this.port = port;
  }

  start(): void {
    const WS = require('ws');
    this.wsServer = new WS.Server({ port: this.port });

    this.wsServer.on('connection', (ws, req) => {
      const connectionId = this.generateId();
      (ws as any).connectionId = connectionId;
      this.connections.set(connectionId, new Set());

      console.log(`[Subscription] New connection: ${connectionId}`);

      ws.on('message', (data) => {
        try {
          const message: SubscriptionMessage = JSON.parse(data.toString());
          this.handleMessage(connectionId, ws, message);
        } catch (e) {
          console.error('[Subscription] Message parse error:', e);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(connectionId);
      });

      ws.on('pong', () => {
        console.log(`[Subscription] Pong received from ${connectionId}`);
      });

      this.sendMessage(ws, { type: 'connection_ack' });
    });

    console.log(`[Subscription] WebSocket server running on port ${this.port}`);
  }

  private handleMessage(
    connectionId: string,
    ws: WebSocket,
    message: SubscriptionMessage
  ): void {
    switch (message.type) {
      case 'connection_init':
        this.sendMessage(ws, { type: 'connection_ack' });
        break;

      case 'start':
        if (message.id && message.payload) {
          this.startSubscription(
            connectionId,
            message.id,
            message.payload.query,
            message.payload.variables
          );
        }
        break;

      case 'stop':
        if (message.id) {
          this.stopSubscription(connectionId, message.id);
        }
        break;

      case 'connection_terminate':
        this.handleDisconnect(connectionId);
        break;

      case 'ping':
        this.sendMessage(ws, { type: 'pong' });
        break;
    }
  }

  private startSubscription(
    connectionId: string,
    subscriptionId: string,
    query: string,
    variables?: Record<string, any>
  ): void {
    const subscription: Subscription = {
      id: subscriptionId,
      query,
      variables,
      emitter: this.extractEmitter(query),
      connectionId,
      createdAt: Date.now(),
      lastPing: Date.now(),
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.connections.get(connectionId)?.add(subscriptionId);

    if (!this.emitters.has(subscription.emitter)) {
      this.emitters.set(subscription.emitter, new Set());
    }
    this.emitters.get(subscription.emitter)?.add(subscriptionId);

    console.log(
      `[Subscription] Started: ${subscriptionId} for emitter: ${subscription.emitter}`
    );
  }

  private stopSubscription(connectionId: string, subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
      this.connections.get(connectionId)?.delete(subscriptionId);
      this.emitters.get(subscription.emitter)?.delete(subscriptionId);

      console.log(`[Subscription] Stopped: ${subscriptionId}`);
    }
  }

  private handleDisconnect(connectionId: string): void {
    const subscriptionIds = this.connections.get(connectionId);
    if (subscriptionIds) {
      for (const subId of subscriptionIds) {
        const sub = this.subscriptions.get(subId);
        if (sub) {
          this.emitters.get(sub.emitter)?.delete(subId);
          this.subscriptions.delete(subId);
        }
      }
    }
    this.connections.delete(connectionId);
    console.log(`[Subscription] Disconnected: ${connectionId}`);
  }

  emitToSubscribers(event: string, data: any): void {
    const subscriptionIds = this.emitters.get(event);
    if (subscriptionIds) {
      const message: SubscriptionMessage = {
        type: 'data',
        id: undefined,
        payload: {
          data: {
            [event]: data,
          },
        },
      };

      for (const subId of subscriptionIds) {
        message.id = subId;
        const sub = this.subscriptions.get(subId);
        if (sub) {
          const ws = this.getConnectionWs(sub.connectionId);
          if (ws) {
            this.sendMessage(ws, message);
          }
        }
      }
    }

    this.emit('event', { event, data });
  }

  private getConnectionWs(connectionId: string): WebSocket | null {
    if (!this.wsServer) return null;

    let found: WebSocket | null = null;
    this.wsServer.clients.forEach((client) => {
      if ((client as any).connectionId === connectionId) {
        found = client;
      }
    });
    return found;
  }

  private sendMessage(ws: WebSocket, message: SubscriptionMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private extractEmitter(query: string): string {
    const match = query.match(/subscription\s+(\w+)/i);
    return match ? match[1] : 'default';
  }

  private generateId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getEmitterCount(emitter: string): number {
    return this.emitters.get(emitter)?.size || 0;
  }

  stop(): void {
    this.wsServer?.close();
    console.log('[Subscription] Server stopped');
  }
}

export const subscriptionManager = new SubscriptionManager();
