import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface CallSignalingMessage {
  type:
    | 'call:offer'
    | 'call:answer'
    | 'call:ice-candidate'
    | 'call:accept'
    | 'call:decline'
    | 'call:end'
    | 'call:ring'
    | 'call:incoming';
  callId?: string;
  fromUserId?: string;
  toUserId?: string;
  payload?: any;
}

export interface CallPayload {
  sdp?: string;
  type?: string;
  candidate?: string;
  candidateMid?: string;
  candidateMLineIndex?: number;
}

export class CallSignalingService extends EventEmitter {
  private connections: Map<string, { ws: WebSocket; userId: string }> =
    new Map();
  private wss: WebSocket.Server | null = null;

  start(port: number = 4002): void {
    this.wss = new WebSocket.Server({ port });

    this.wss.on('connection', (ws, req) => {
      console.log('[CallSignaling] New connection');

      ws.on('message', (data) => {
        try {
          const message: CallSignalingMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (e) {
          console.error('[CallSignaling] Message parse error:', e);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      this.sendMessage(ws, { type: 'call:accept' });
    });

    this.wss.on('error', (err) => {
      console.error('[CallSignaling] Server error:', err.message);
    });

    console.log(`[CallSignaling] Server running on port ${port}`);
  }

  private handleMessage(ws: WebSocket, message: CallSignalingMessage): void {
    const connection = [...this.connections.entries()].find(
      ([, conn]) => conn.ws === ws
    );

    switch (message.type) {
      case 'call:offer':
      case 'call:answer':
      case 'call:ice-candidate':
        this.forwardToParticipant(message);
        break;

      case 'call:incoming':
        if (message.fromUserId) {
          this.connections.set(message.fromUserId, {
            ws,
            userId: message.fromUserId,
          });
        }
        break;

      case 'call:accept':
      case 'call:decline':
      case 'call:end':
        this.emit('call:event', message);
        break;

      case 'call:ring':
        this.forwardToParticipant(message);
        break;
    }
  }

  private forwardToParticipant(message: CallSignalingMessage): void {
    if (!message.toUserId) return;

    const connection = this.connections.get(message.toUserId);
    if (connection) {
      this.sendMessage(connection.ws, message);
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const entry = [...this.connections.entries()].find(
      ([, conn]) => conn.ws === ws
    );
    if (entry) {
      this.connections.delete(entry[0]);
    }
  }

  private sendMessage(ws: WebSocket, message: CallSignalingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendOffer(calleeId: string, callId: string, sdp: string): void {
    const connection = this.connections.get(calleeId);
    if (connection) {
      this.sendMessage(connection.ws, {
        type: 'call:offer',
        callId,
        payload: { sdp, type: 'offer' },
      });
    }
  }

  sendAnswer(callerId: string, callId: string, sdp: string): void {
    const connection = this.connections.get(callerId);
    if (connection) {
      this.sendMessage(connection.ws, {
        type: 'call:answer',
        callId,
        payload: { sdp, type: 'answer' },
      });
    }
  }

  sendIceCandidate(toUserId: string, callId: string, candidate: any): void {
    const connection = this.connections.get(toUserId);
    if (connection) {
      this.sendMessage(connection.ws, {
        type: 'call:ice-candidate',
        callId,
        payload: candidate,
      });
    }
  }

  notifyIncomingCall(
    userId: string,
    callData: {
      callId: string;
      callerName: string;
      isVideo: boolean;
    }
  ): void {
    const connection = this.connections.get(userId);
    if (connection) {
      this.sendMessage(connection.ws, {
        type: 'call:incoming',
        payload: callData,
      });
    }
  }

  getConnection(userId: string): WebSocket | null {
    return this.connections.get(userId)?.ws || null;
  }

  hasConnection(userId: string): boolean {
    const conn = this.connections.get(userId);
    return conn?.ws?.readyState === WebSocket.OPEN;
  }
}

export const callSignalingService = new CallSignalingService();
