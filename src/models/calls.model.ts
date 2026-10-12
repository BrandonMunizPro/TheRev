import { AppDataSource } from '../data-source';
import { Call, CallStatus, CallInvitation } from '../entities/Call';
import { CallConnection } from '../entities/CallConnection';
import { CallSignal } from '../entities/CallSignal';
import { User } from '../entities/User';
import { EntityManager, In, IsNull, MoreThan } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';
import {
  assertCallParticipant,
  boundedCallSetting,
  CallAction,
  liveCallStatuses,
  transitionTarget,
  uuidPattern,
  validateSignal,
} from '../utils/callPolicy';

export async function publishCallEvent(
  manager: EntityManager,
  kind: 'state' | 'signal',
  id: string
): Promise<void> {
  await manager.query('SELECT pg_notify($1, $2)', [
    'therev_calls_v1',
    JSON.stringify({ kind, id }),
  ]);
}
export function callView(call: Call) {
  return {
    id: call.id,
    callerId: call.callerId,
    calleeId: call.calleeId,
    status: call.status,
    isVideo: call.isVideo,
    version: call.version,
    callerName: call.caller?.userName || 'Caller',
    calleeName: call.callee?.userName || 'Recipient',
    ringExpiresAt: call.ringExpiresAt,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    callerMuted: call.callerMuted,
    calleeMuted: call.calleeMuted,
    callerVideoEnabled: call.callerVideoEnabled,
    calleeVideoEnabled: call.calleeVideoEnabled,
    callerConnectionId: call.callerConnectionId,
    calleeConnectionId: call.calleeConnectionId,
  };
}
export class CallsModel {
  private get repo() {
    return AppDataSource.getRepository(Call);
  }
  private requireId(id: string): void {
    if (!uuidPattern.test(id || ''))
      throw ErrorHandler.invalidInput('Invalid call identifier');
  }
  private async connection(
    manager: EntityManager,
    userId: string,
    id?: string
  ): Promise<CallConnection> {
    if (id) this.requireId(id);
    const connection = await manager.getRepository(CallConnection).findOne({
      where: {
        userId,
        ...(id ? { id } : {}),
        disconnectedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { expiresAt: 'DESC' },
    });
    if (!connection)
      throw ErrorHandler.operationNotAllowed(
        'Authenticated signaling connection required'
      );
    return connection;
  }
  async registerConnection(
    userId: string,
    instanceId: string,
    tokenExpires: number,
    resumeId?: string
  ): Promise<CallConnection> {
    this.requireId(userId);
    return AppDataSource.transaction(async (manager) => {
      if (
        !(await manager.getRepository(User).findOne({ where: { id: userId } }))
      )
        throw ErrorHandler.notAuthenticated();
      const repo = manager.getRepository(CallConnection);
      let connection: CallConnection;
      if (resumeId) {
        this.requireId(resumeId);
        connection = await repo.findOne({
          where: { id: resumeId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!connection || connection.userId !== userId)
          throw ErrorHandler.forbidden(
            'Cannot resume another signaling session'
          );
        if (!connection.disconnectedAt)
          throw ErrorHandler.operationNotAllowed(
            'Signaling session is already connected'
          );
        if (connection.expiresAt.getTime() <= Date.now())
          throw ErrorHandler.operationNotAllowed('Signaling session expired');
      } else connection = repo.create({ userId });
      connection.instanceId = instanceId;
      connection.disconnectedAt = null;
      connection.expiresAt = new Date(
        Math.min(
          tokenExpires * 1000,
          Date.now() +
            boundedCallSetting('CALL_CONNECTION_LEASE_MS', 30000, 1000, 120000)
        )
      );
      return repo.save(connection);
    });
  }
  async heartbeatConnection(
    id: string,
    instanceId: string,
    tokenExpires: number
  ): Promise<boolean> {
    const result = await AppDataSource.getRepository(CallConnection).update(
      {
        id,
        instanceId,
        disconnectedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      {
        expiresAt: new Date(
          Math.min(
            tokenExpires * 1000,
            Date.now() +
              boundedCallSetting(
                'CALL_CONNECTION_LEASE_MS',
                30000,
                1000,
                120000
              )
          )
        ),
      }
    );
    return result.affected === 1;
  }
  async disconnectConnection(id: string, instanceId: string): Promise<void> {
    await AppDataSource.getRepository(CallConnection).update(
      { id, instanceId, disconnectedAt: IsNull() },
      {
        disconnectedAt: new Date(),
        expiresAt: new Date(
          Date.now() +
            boundedCallSetting('CALL_DISCONNECT_GRACE_MS', 10000, 0, 60000)
        ),
      }
    );
  }
  async initiateCall(
    callerId: string,
    calleeId: string,
    isVideo = false,
    connectionId?: string
  ): Promise<Call> {
    if (!callerId) throw ErrorHandler.notAuthenticated();
    this.requireId(calleeId);
    if (callerId === calleeId)
      throw ErrorHandler.operationNotAllowed('Cannot call yourself');
    await this.sweep();
    const saved = await AppDataSource.transaction(async (manager) => {
      // Serialize every pair of users in one deterministic order, including reversed calls.
      for (const id of [callerId, calleeId].sort()) {
        const user = await manager
          .getRepository(User)
          .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!user) throw ErrorHandler.userNotFound(id);
      }
      const busy = await manager
        .getRepository(Call)
        .createQueryBuilder('call')
        .where('call.status IN (:...live)', { live: liveCallStatuses })
        .andWhere(
          '(call.callerId IN (:...users) OR call.calleeId IN (:...users))',
          { users: [callerId, calleeId] }
        )
        .getOne();
      if (busy)
        throw ErrorHandler.operationNotAllowed(
          'A participant is already busy in another call'
        );
      const caller = await this.connection(manager, callerId, connectionId);
      await this.connection(manager, calleeId);
      const call = await manager
        .getRepository(Call)
        .save({
          callerId,
          calleeId,
          isVideo,
          callerConnectionId: caller.id,
          status: CallStatus.RINGING,
          version: 1,
          ringExpiresAt: new Date(
            Date.now() +
              boundedCallSetting('CALL_RING_TIMEOUT_MS', 30000, 1000, 120000)
          ),
          callerVideoEnabled: isVideo,
          calleeVideoEnabled: isVideo,
        });
      await publishCallEvent(manager, 'state', call.id);
      return call;
    });
    return this.getCall(saved.id, callerId);
  }
  private async finish(
    manager: EntityManager,
    call: Call,
    status: CallStatus
  ): Promise<Call> {
    call.status = status;
    call.endedAt = new Date();
    call.offerSdp = call.answerSdp = call.iceCandidates = null;
    call.version++;
    await manager.getRepository(CallSignal).delete({ callId: call.id });
    const saved = await manager.getRepository(Call).save(call);
    await publishCallEvent(manager, 'state', call.id);
    return saved;
  }
  private async transition(
    callId: string,
    userId: string,
    action: CallAction,
    connectionId?: string
  ): Promise<Call> {
    this.requireId(callId);
    await this.sweep();
    let expired = false;
    await AppDataSource.transaction(async (manager) => {
      const call = await manager
        .getRepository(Call)
        .createQueryBuilder('call')
        .where('call.id = :id', { id: callId })
        .setLock('pessimistic_write')
        .getOne();
      if (!call) throw ErrorHandler.notFound('Call', callId);
      const target = transitionTarget(call, userId, action);
      if (call.status === target) return;
      if (
        call.status !== CallStatus.ACTIVE &&
        (call.ringExpiresAt?.getTime() ?? 0) <= Date.now()
      ) {
        expired = true;
        await this.finish(manager, call, CallStatus.TIMED_OUT);
        return;
      }
      if (action === 'accept') {
        const connection = await this.connection(manager, userId, connectionId);
        call.calleeConnectionId = connection.id;
        call.status = CallStatus.ACTIVE;
        call.startedAt = new Date();
        call.version++;
        await manager.getRepository(Call).save(call);
        await publishCallEvent(manager, 'state', call.id);
      } else await this.finish(manager, call, target);
    });
    if (expired)
      throw ErrorHandler.operationNotAllowed('Call ringing deadline expired');
    return this.getCall(callId, userId);
  }
  async acceptCall(id: string, userId: string, connectionId?: string) {
    return this.transition(id, userId, 'accept', connectionId);
  }
  async declineCall(id: string, userId: string) {
    return this.transition(id, userId, 'decline');
  }
  async cancelCall(id: string, userId: string) {
    return this.transition(id, userId, 'cancel');
  }
  async endCall(id: string, userId: string) {
    return this.transition(id, userId, 'end');
  }
  async getCall(id: string, userId: string): Promise<Call> {
    this.requireId(id);
    const call = await this.repo.findOne({ where: { id } });
    if (!call) throw ErrorHandler.notFound('Call', id);
    assertCallParticipant(call, userId);
    return call;
  }
  async getActiveCall(userId: string): Promise<Call | null> {
    if (!userId) throw ErrorHandler.notAuthenticated();
    await this.sweep();
    return this.repo.findOne({
      where: [
        { callerId: userId, status: In(liveCallStatuses) },
        { calleeId: userId, status: In(liveCallStatuses) },
      ],
    });
  }
  async getPendingCallInvitation(
    userId: string
  ): Promise<CallInvitation | null> {
    const call = await this.getActiveCall(userId);
    if (!call || call.calleeId !== userId || call.status === CallStatus.ACTIVE)
      return null;
    return {
      callId: call.id,
      callerName: call.caller?.userName || 'Caller',
      callerAvatarUrl: call.caller?.avatarUrl,
      isVideo: call.isVideo,
    };
  }
  async updateControls(
    id: string,
    userId: string,
    muted?: boolean,
    videoEnabled?: boolean
  ): Promise<Call> {
    this.requireId(id);
    await AppDataSource.transaction(async (manager) => {
      const call = await manager
        .getRepository(Call)
        .createQueryBuilder('call')
        .where('call.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!call) throw ErrorHandler.notFound('Call', id);
      assertCallParticipant(call, userId);
      if (call.status !== CallStatus.ACTIVE)
        throw ErrorHandler.operationNotAllowed(
          'Call must be accepted to change controls'
        );
      if (videoEnabled && !call.isVideo)
        throw ErrorHandler.operationNotAllowed('This is an audio call');
      if (typeof muted !== 'boolean' && typeof videoEnabled !== 'boolean')
        throw ErrorHandler.invalidInput('Choose a call control');
      const caller = call.callerId === userId;
      if (typeof muted === 'boolean') {
        if (caller) call.callerMuted = muted;
        else call.calleeMuted = muted;
      }
      if (typeof videoEnabled === 'boolean') {
        if (caller) call.callerVideoEnabled = videoEnabled;
        else call.calleeVideoEnabled = videoEnabled;
      }
      call.version++;
      await manager.getRepository(Call).save(call);
      await publishCallEvent(manager, 'state', id);
    });
    return this.getCall(id, userId);
  }
  async sendSignal(
    callId: string,
    userId: string,
    type: string,
    payload: unknown,
    connectionId?: string
  ): Promise<CallSignal> {
    this.requireId(callId);
    // Only the WebSocket transport can bind this operation to the sending device.
    // Legacy GraphQL signaling has no authenticated connection binding.
    if (!connectionId)
      throw ErrorHandler.forbidden(
        'Use the authenticated WebSocket connection for call signaling'
      );
    this.requireId(connectionId);
    const validated = validateSignal(type, payload);
    return AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Call);
      const call = await repo
        .createQueryBuilder('call')
        .where('call.id = :id', { id: callId })
        .setLock('pessimistic_write')
        .getOne();
      if (!call) throw ErrorHandler.notFound('Call', callId);
      assertCallParticipant(call, userId);
      if (call.status !== CallStatus.ACTIVE)
        throw ErrorHandler.operationNotAllowed(
          'Only accepted calls can exchange signaling'
        );
      const caller = call.callerId === userId;
      const fromId = caller ? call.callerConnectionId : call.calleeConnectionId;
      const toId = caller ? call.calleeConnectionId : call.callerConnectionId;
      if (!fromId || !toId)
        throw ErrorHandler.operationNotAllowed(
          'Call signaling sessions are unavailable'
        );
      if (fromId !== connectionId)
        throw ErrorHandler.forbidden(
          'Signaling belongs to the selected call session'
        );
      await this.connection(manager, userId, fromId);
      await this.connection(
        manager,
        caller ? call.calleeId : call.callerId,
        toId
      );
      if (type === 'call:offer') {
        if (!caller || (call.offerSdp && !call.answerSdp))
          throw ErrorHandler.forbidden(
            'Only the caller can create a new offer after the previous answer'
          );
        call.offerSdp = validated.sdp as string;
        call.answerSdp = null;
        await repo.save(call);
      } else if (type === 'call:answer') {
        if (caller || !call.offerSdp || call.answerSdp)
          throw ErrorHandler.forbidden(
            'Only the recipient can answer a pending offer'
          );
        call.answerSdp = validated.sdp as string;
        await repo.save(call);
      }
      const signals = manager.getRepository(CallSignal);
      if (
        (await signals.count({ where: { callId, fromUserId: userId } })) >= 256
      )
        throw ErrorHandler.operationNotAllowed(
          'Too many unacknowledged signals'
        );
      const signal = await signals.save({
        callId,
        fromUserId: userId,
        toUserId: caller ? call.calleeId : call.callerId,
        toConnectionId: toId,
        type,
        payload: validated,
        expiresAt: new Date(Date.now() + 60000),
      });
      await publishCallEvent(manager, 'signal', signal.id);
      return signal;
    });
  }
  async pendingSignals(
    userId: string,
    connectionId: string
  ): Promise<CallSignal[]> {
    const rows = await AppDataSource.getRepository(CallSignal).find({
      where: {
        toUserId: userId,
        toConnectionId: connectionId,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 256,
    });
    const result: CallSignal[] = [];
    for (const signal of rows) {
      try {
        if (
          (await this.getCall(signal.callId, userId)).status ===
          CallStatus.ACTIVE
        )
          result.push(signal);
      } catch {
        /* Terminated calls cannot signal. */
      }
    }
    return result;
  }
  async acknowledgeSignal(
    id: string,
    userId: string,
    connectionId: string
  ): Promise<void> {
    this.requireId(id);
    const repo = AppDataSource.getRepository(CallSignal);
    const signal = await repo.findOne({ where: { id } });
    if (!signal) return;
    if (signal.toUserId !== userId || signal.toConnectionId !== connectionId)
      throw ErrorHandler.forbidden(
        'Only the receiving session can acknowledge a signal'
      );
    await repo.delete({ id, toUserId: userId, toConnectionId: connectionId });
  }
  async updateSdp(
    id: string,
    userId: string,
    sdp: string,
    isOffer: boolean
  ): Promise<Call> {
    await this.sendSignal(id, userId, isOffer ? 'call:offer' : 'call:answer', {
      sdp,
    });
    return this.getCall(id, userId);
  }
  async updateIceCandidates(
    id: string,
    userId: string,
    candidates: string
  ): Promise<Call> {
    if (candidates.length > 32768)
      throw ErrorHandler.invalidInput('Too many ICE candidates');
    let parsed: any;
    try {
      parsed = JSON.parse(candidates);
    } catch {
      throw ErrorHandler.invalidInput('ICE candidates must be JSON');
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (!rows.length || rows.length > 16)
      throw ErrorHandler.invalidInput('Submit 1 to 16 ICE candidates');
    rows.forEach((candidate) =>
      validateSignal('call:ice-candidate', candidate)
    );
    for (const candidate of rows)
      await this.sendSignal(id, userId, 'call:ice-candidate', candidate);
    return this.getCall(id, userId);
  }
  async sweep(): Promise<void> {
    // PostgreSQL leases also detect process crashes, missed pongs, and expired sessions.
    const candidates = await this.repo.find({
      where: { status: In(liveCallStatuses) },
      loadEagerRelations: false,
    });
    for (const candidate of candidates)
      await AppDataSource.transaction(async (manager) => {
        const call = await manager
          .getRepository(Call)
          .createQueryBuilder('call')
          .where('call.id = :id', { id: candidate.id })
          .setLock('pessimistic_write')
          .getOne();
        if (!call || !liveCallStatuses.includes(call.status)) return;
        if (
          call.status !== CallStatus.ACTIVE &&
          (call.ringExpiresAt?.getTime() ?? 0) <= Date.now()
        ) {
          await this.finish(manager, call, CallStatus.TIMED_OUT);
          return;
        }
        const ids = [
          call.callerConnectionId,
          ...(call.status === CallStatus.ACTIVE
            ? [call.calleeConnectionId]
            : []),
        ];
        const bound = ids.filter(Boolean);
        const connections = bound.length
          ? await manager
              .getRepository(CallConnection)
              .find({
                where: { id: In(bound), expiresAt: MoreThan(new Date()) },
              })
          : [];
        const calleeOnline =
          call.status === CallStatus.ACTIVE ||
          !!(await manager
            .getRepository(CallConnection)
            .findOne({
              where: { userId: call.calleeId, expiresAt: MoreThan(new Date()) },
            }));
        if (connections.length !== ids.length || !calleeOnline)
          await this.finish(manager, call, CallStatus.DISCONNECTED);
      });
    await AppDataSource.getRepository(CallSignal)
      .createQueryBuilder()
      .delete()
      .where('expires_at <= CURRENT_TIMESTAMP')
      .execute();
    // Keep expired presence briefly for reconnect diagnostics, then bound table growth.
    await AppDataSource.getRepository(CallConnection)
      .createQueryBuilder()
      .delete()
      .where("expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'")
      .execute();
  }
}
export const callsModel = new CallsModel();
