import { safeImage } from '../messaging/MessagingUI.js';

export const callFields =
  'id callerId calleeId callerName calleeName status isVideo version ringExpiresAt startedAt endedAt callerMuted calleeMuted callerVideoEnabled calleeVideoEnabled callerConnectionId calleeConnectionId';
const live = ['PENDING', 'RINGING', 'ACTIVE'];

export function validateCallEndpoint(value, socket = false) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== (socket ? 'wss:' : 'https:') &&
      !(loopback && url.protocol === (socket ? 'ws:' : 'http:')))
  ) {
    throw new Error(
      'Remote call endpoints require HTTPS/WSS and cannot contain credentials'
    );
  }
  return url.href;
}

export class CallController {
  constructor(app, options = {}) {
    this.app = app;
    this.configure(options);
    this.socket = null;
    this.connectionId = null;
    this.resumeId = null;
    this.ready = false;
    this.call = null;
    this.generation = 0;
    this.retry = null;
    this.signals = new Map();
  }

  configure(options = {}) {
    try {
      const apiUrl = validateCallEndpoint(
        options.apiUrl || 'http://localhost:4000/graphql'
      );
      const signalingUrl = validateCallEndpoint(
        options.signalingUrl || 'ws://localhost:4002',
        true
      );
      if (this.socket) this.stop();
      this.apiUrl = apiUrl;
      this.signalingUrl = signalingUrl;
      this.configError = null;
    } catch (error) {
      this.configError = error;
      throw error;
    }
  }

  async request(query, variables = {}) {
    const token = this.app.jwtToken,
      generation = this.generation;
    if (!token) throw new Error('Please sign in to use call controls');
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok)
      throw new Error(`Call request failed (${response.status})`);
    const result = await response.json();
    if (generation !== this.generation || this.app.jwtToken !== token)
      throw new Error('Call session changed');
    if (result.errors)
      throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.data;
  }

  start() {
    if (this.configError) return Promise.reject(this.configError);
    if (!this.app.jwtToken || !this.app.currentUser) return Promise.resolve();
    try {
      const payload = JSON.parse(
        atob(
          this.app.jwtToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        )
      );
      if (payload.exp * 1000 <= Date.now()) {
        this.app.clearAuthSession();
        return Promise.reject(
          new Error('Your session expired. Please sign in again.')
        );
      }
    } catch {
      /* The server remains the authority for token verification. */
    }
    if (this.ready && this.token === this.app.jwtToken)
      return Promise.resolve();
    if (this.startJob && this.token === this.app.jwtToken) return this.startJob;
    if (this.token && this.token !== this.app.jwtToken) this.stop();
    clearTimeout(this.retry);
    this.retry = null;
    this.token = this.app.jwtToken;
    const generation = this.generation;
    const socket = new WebSocket(this.signalingUrl);
    this.socket = socket;
    this.startJob = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Call signaling authentication timed out'));
      }, 7000);
      socket.addEventListener('open', () => {
        if (generation !== this.generation) {
          socket.close();
          return;
        }
        socket.send(
          JSON.stringify({
            type: 'auth',
            token: this.token,
            ...(this.resumeId ? { resumeConnectionId: this.resumeId } : {}),
          })
        );
      });
      socket.addEventListener('message', (event) => {
        if (generation !== this.generation || this.socket !== socket) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'ready') {
            if (message.userId !== this.app.currentUser?.id)
              throw new Error('Call session identity mismatch');
            this.connectionId = this.resumeId = message.connectionId;
            this.ready = true;
            clearTimeout(timeout);
            resolve();
            this.render();
          } else if (message.type === 'error') {
            if (!this.ready) {
              this.resumeId = null;
              clearTimeout(timeout);
              reject(new Error(message.message));
            } else this.error(new Error(message.message));
          } else if (message.type === 'call:snapshot') {
            if (message.call) this.apply(message.call);
            else if (this.call && live.includes(this.call.status))
              void this.reconcile().catch((error) => this.error(error));
          } else if (
            message.type === 'call:incoming' ||
            message.type === 'call:state' ||
            message.type === 'call:result'
          ) {
            if (message.call) this.apply(message.call);
          } else if (
            ['call:offer', 'call:answer', 'call:ice-candidate'].includes(
              message.type
            )
          ) {
            // Phase 3 can attach a media adapter to this authenticated signaling boundary.
            if (
              message.callId !== this.call?.id ||
              this.call.status !== 'ACTIVE'
            )
              return;
            if (
              !this.signals.has(message.signalId) &&
              this.signals.size < 256
            ) {
              this.signals.set(message.signalId, message);
              window.dispatchEvent(
                new CustomEvent('therev-call-signal', { detail: message })
              );
            }
          }
        } catch (error) {
          this.error(error);
        }
      });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Call signaling unavailable'));
      });
      socket.addEventListener('close', (event) => {
        clearTimeout(timeout);
        reject(new Error('Call signaling disconnected'));
        if (generation !== this.generation || this.socket !== socket) return;
        const authenticated = this.ready;
        this.socket = null;
        this.ready = false;
        this.startJob = null;
        this.render();
        if (event.code === 1008 && authenticated) {
          this.app.clearAuthSession();
          this.error(new Error('Call session expired. Please sign in again.'));
          return;
        }
        if (event.code === 1008) this.resumeId = null;
        if (this.app.jwtToken === this.token)
          this.retry = setTimeout(() => {
            this.retry = null;
            void this.start().catch((error) => this.error(error));
          }, 2000);
      });
    });
    // Passive startup may happen before a user presses a button.
    this.startJob.catch(() => {});
    return this.startJob;
  }

  async reconcile() {
    const data = await this.request(
      `query Active { getActiveCall { ${callFields} } }`
    );
    if (data.getActiveCall) this.apply(data.getActiveCall);
    else if (this.call) {
      const old = await this.request(
        `query State($id: ID!) { callById(callId: $id) { ${callFields} } }`,
        { id: this.call.id }
      );
      this.apply(old.callById);
    }
  }

  apply(call) {
    const me = this.app.currentUser?.id;
    if (!call || (call.callerId !== me && call.calleeId !== me)) return;
    if (this.call?.id === call.id && this.call.version >= call.version) return;
    if (
      this.call &&
      this.call.id !== call.id &&
      live.includes(this.call.status) &&
      !live.includes(call.status)
    )
      return;
    this.call = call;
    if (!live.includes(call.status)) {
      this.signals.clear();
      const labels = {
        ENDED: 'Call ended',
        DECLINED: 'Call declined',
        CANCELLED: 'Call cancelled',
        TIMED_OUT: 'No answer',
        DISCONNECTED: 'Call disconnected',
      };
      this.app.showSpeechBubble(labels[call.status] || 'Call finished', 4000);
    }
    this.render();
  }

  async perform(operation) {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await operation();
    } catch (error) {
      this.error(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  initiate(calleeId, isVideo = false) {
    return this.perform(async () => {
      await this.start();
      const data = await this.request(
        `mutation Initiate($data: InitiateCallInput!) { initiateCall(data: $data) { ${callFields} } }`,
        { data: { calleeId, isVideo, connectionId: this.connectionId } }
      );
      this.apply(data.initiateCall);
    });
  }

  accept() {
    return this.perform(async () => {
      await this.start();
      const data = await this.request(
        `mutation Accept($id: ID!, $connection: ID!) { acceptCall(callId: $id, connectionId: $connection) { ${callFields} } }`,
        { id: this.call?.id, connection: this.connectionId }
      );
      this.apply(data.acceptCall);
    });
  }

  decline() {
    return this.finish('declineCall');
  }
  end() {
    return this.finish(
      this.call?.status === 'ACTIVE'
        ? 'endCall'
        : this.call?.callerId === this.app.currentUser?.id
          ? 'cancelCall'
          : 'declineCall'
    );
  }

  finish(operation) {
    return this.perform(async () => {
      if (!this.call) return;
      const id = this.call.id;
      await this.request(
        `mutation Finish($id: ID!) { ${operation}(callId: $id) }`,
        { id }
      );
      const data = await this.request(
        `query State($id: ID!) { callById(callId: $id) { ${callFields} } }`,
        { id }
      );
      this.apply(data.callById);
    });
  }

  controls(muted, videoEnabled) {
    return this.perform(async () => {
      if (!this.call || this.call.status !== 'ACTIVE')
        throw new Error('Accept the call first');
      const data = await this.request(
        `mutation Controls($id: ID!, $muted: Boolean, $video: Boolean) { updateCallControls(callId: $id, muted: $muted, videoEnabled: $video) { ${callFields} } }`,
        { id: this.call.id, muted, video: videoEnabled }
      );
      this.apply(data.updateCallControls);
    });
  }
  toggleMute() {
    const caller = this.call?.callerId === this.app.currentUser?.id;
    return this.controls(
      !(caller ? this.call?.callerMuted : this.call?.calleeMuted),
      null
    );
  }
  toggleVideo() {
    const caller = this.call?.callerId === this.app.currentUser?.id;
    return this.controls(
      null,
      !(caller ? this.call?.callerVideoEnabled : this.call?.calleeVideoEnabled)
    );
  }

  acknowledgeSignal(signalId) {
    if (!this.ready || !this.signals.has(signalId)) return;
    this.socket.send(JSON.stringify({ type: 'call:signal-ack', signalId }));
    this.signals.delete(signalId);
  }

  render() {
    const incoming = document.getElementById('incoming-call-modal');
    const active = document.getElementById('active-call-modal');
    const call = this.call,
      me = this.app.currentUser?.id;
    const ringing = call && ['PENDING', 'RINGING'].includes(call.status);
    const isIncoming = ringing && call.calleeId === me;
    const showActive = call && live.includes(call.status) && !isIncoming;
    for (const [element, shown] of [
      [incoming, isIncoming],
      [active, showActive],
    ]) {
      if (element) {
        element.classList.toggle('active', !!shown);
        element.style.display = shown ? 'flex' : 'none';
      }
    }
    if (!call) return;
    const caller = call.callerId === me;
    const set = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    set('incoming-callername', call.callerName);
    set(
      'incoming-call-type',
      call.isVideo ? 'Video call request' : 'Audio call request'
    );
    document
      .getElementById('incoming-call-avatar')
      ?.replaceChildren(safeImage(null, '', 'Caller'));
    set(
      'active-call-title',
      call.isVideo ? 'Video call request' : 'Audio call request'
    );
    set(
      'call-partner-name',
      `Call with ${caller ? call.calleeName : call.callerName}`
    );
    set(
      'call-status',
      !this.ready ? 'Signaling reconnecting' : ringing ? 'Ringing' : 'Accepted'
    );
    set('call-media-notice', 'Audio and video are not connected yet.');
    const selected =
      (caller ? call.callerConnectionId : call.calleeConnectionId) ===
      this.connectionId;
    if (call.status === 'ACTIVE' && !selected)
      set('call-status', 'Accepted on another device');
    const muted = caller ? call.callerMuted : call.calleeMuted;
    const video = caller ? call.callerVideoEnabled : call.calleeVideoEnabled;
    set('call-mute-label', muted ? 'Unmute' : 'Mute');
    set('call-video-label', video ? 'Disable video' : 'Enable video');
    set('call-end-label', ringing ? 'Cancel' : 'End');
    for (const [id, allowed] of [
      ['mute-btn', selected && call.status === 'ACTIVE'],
      ['video-btn', selected && call.status === 'ACTIVE' && call.isVideo],
      ['call-end-btn', true],
      ['call-accept-btn', isIncoming],
      ['call-decline-btn', isIncoming],
    ]) {
      const button = document.getElementById(id);
      if (button) button.disabled = this.busy || !this.ready || !allowed;
    }
  }

  error(error) {
    this.app.showSpeechBubble(error.message || 'Call operation failed', 5000);
  }

  stop() {
    this.generation++;
    clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close();
    this.socket = null;
    this.ready = false;
    this.startJob = null;
    this.token = null;
    this.connectionId = this.resumeId = null;
    this.call = null;
    this.signals.clear();
    this.busy = false;
    this.render();
  }
}
