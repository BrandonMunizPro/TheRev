import { Call, CallStatus } from '../entities/Call';
import { ErrorHandler } from '../errors/ErrorHandler';
import { GraphQLContext } from '../graphql/context';

export const liveCallStatuses = [
  CallStatus.PENDING,
  CallStatus.RINGING,
  CallStatus.ACTIVE,
];
export const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function callActor(ctx: GraphQLContext): string {
  if (!ctx.user?.userId) throw ErrorHandler.notAuthenticated();
  return ctx.user.userId;
}
export function assertCallParticipant(call: Call, userId: string): void {
  if (!userId) throw ErrorHandler.notAuthenticated();
  if (call.callerId !== userId && call.calleeId !== userId)
    throw ErrorHandler.forbidden('Call participant access required');
}
export type CallAction = 'accept' | 'decline' | 'cancel' | 'end';
export function transitionTarget(
  call: Call,
  userId: string,
  action: CallAction
): CallStatus {
  assertCallParticipant(call, userId);
  if ((action === 'accept' || action === 'decline') && userId !== call.calleeId)
    throw ErrorHandler.forbidden('Only the recipient can accept or decline');
  if (action === 'cancel' && userId !== call.callerId)
    throw ErrorHandler.forbidden('Only the caller can cancel');
  const target = {
    accept: CallStatus.ACTIVE,
    decline: CallStatus.DECLINED,
    cancel: CallStatus.CANCELLED,
    end: CallStatus.ENDED,
  }[action];
  if (call.status === target) return target; // Authorized duplicate requests are idempotent.
  const allowed =
    action === 'end'
      ? call.status === CallStatus.ACTIVE
      : [CallStatus.PENDING, CallStatus.RINGING].includes(call.status);
  if (!allowed)
    throw ErrorHandler.operationNotAllowed('Invalid call lifecycle transition');
  return target;
}
export function boundedCallSetting(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
export function validateSignal(
  type: string,
  payload: any
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw ErrorHandler.invalidInput('Invalid signaling payload');
  if (type === 'call:offer' || type === 'call:answer') {
    const expected = type === 'call:offer' ? 'offer' : 'answer';
    if (
      typeof payload.sdp !== 'string' ||
      !payload.sdp.trim() ||
      payload.sdp.length > 65536 ||
      (payload.type && payload.type !== expected)
    )
      throw ErrorHandler.invalidInput('Invalid SDP payload');
    return { type: expected, sdp: payload.sdp };
  }
  if (
    type !== 'call:ice-candidate' ||
    typeof payload.candidate !== 'string' ||
    payload.candidate.length > 4096 ||
    (payload.sdpMid != null &&
      (typeof payload.sdpMid !== 'string' || payload.sdpMid.length > 64)) ||
    (payload.sdpMLineIndex != null &&
      (!Number.isInteger(payload.sdpMLineIndex) ||
        payload.sdpMLineIndex < 0 ||
        payload.sdpMLineIndex > 255)) ||
    (payload.usernameFragment != null &&
      (typeof payload.usernameFragment !== 'string' ||
        payload.usernameFragment.length > 256))
  )
    throw ErrorHandler.invalidInput('Invalid ICE payload');
  return {
    candidate: payload.candidate,
    sdpMid: payload.sdpMid ?? null,
    sdpMLineIndex: payload.sdpMLineIndex ?? null,
    usernameFragment: payload.usernameFragment ?? null,
  };
}
