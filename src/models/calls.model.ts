import { AppDataSource } from '../data-source';
import { Call, CallStatus, CallInvitation } from '../entities/Call';
import { User } from '../entities/User';
import { ErrorHandler } from '../errors/ErrorHandler';

export class CallsModel {
  private callRepo = AppDataSource.getRepository(Call);
  private userRepo = AppDataSource.getRepository(User);

  async initiateCall(
    callerId: string,
    calleeId: string,
    isVideo: boolean = false
  ): Promise<Call> {
    if (!callerId) {
      throw ErrorHandler.notAuthenticated();
    }

    if (callerId === calleeId) {
      throw ErrorHandler.operationNotAllowed('Cannot call yourself');
    }

    // @ts-ignore - TypeORM false positive
    const callee = await this.userRepo.findOne({ where: { id: calleeId } });
    if (!callee) {
      throw ErrorHandler.userNotFound(calleeId);
    }

    // @ts-ignore
    const existingCall = await this.callRepo.findOne({
      where: [
        { callerId, calleeId, status: CallStatus.RINGING },
        { callerId, calleeId, status: CallStatus.ACTIVE },
        { callerId, calleeId, status: CallStatus.PENDING },
      ],
    });

    if (existingCall) {
      throw ErrorHandler.operationNotAllowed('Call already in progress');
    }

    const call = this.callRepo.create({
      callerId,
      calleeId,
      isVideo,
      status: CallStatus.PENDING,
    });

    return this.callRepo.save(call);
  }

  async acceptCall(callId: string, userId: string): Promise<Call> {
    // @ts-ignore
    const call = await this.callRepo.findOne({
      where: { id: callId },
      relations: ['caller', 'callee'],
    });

    if (!call) {
      throw ErrorHandler.notFound('Call not found');
    }

    if (call.calleeId !== userId && call.callerId !== userId) {
      throw ErrorHandler.insufficientPermissions('accept', 'call');
    }

    if (
      call.status !== CallStatus.PENDING &&
      call.status !== CallStatus.RINGING
    ) {
      throw ErrorHandler.operationNotAllowed('Call is no longer available');
    }

    call.status = CallStatus.ACTIVE;
    call.startedAt = new Date();

    return this.callRepo.save(call);
  }

  async declineCall(callId: string, userId: string): Promise<void> {
    // @ts-ignore
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw ErrorHandler.notFound('Call not found');
    }

    if (call.calleeId !== userId && call.callerId !== userId) {
      throw ErrorHandler.insufficientPermissions('decline', 'call');
    }

    call.status = CallStatus.DECLINED;
    await this.callRepo.save(call);
  }

  async cancelCall(callId: string, userId: string): Promise<void> {
    // @ts-ignore
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw ErrorHandler.notFound('Call not found');
    }

    if (call.callerId !== userId) {
      throw ErrorHandler.insufficientPermissions('cancel', 'call');
    }

    call.status = CallStatus.CANCELLED;
    await this.callRepo.save(call);
  }

  async endCall(callId: string, userId: string): Promise<void> {
    // @ts-ignore
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw ErrorHandler.notFound('Call not found');
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      throw ErrorHandler.insufficientPermissions('end', 'call');
    }

    call.status = CallStatus.ENDED;
    call.endedAt = new Date();
    await this.callRepo.save(call);
  }

  async getActiveCall(userId: string): Promise<Call | null> {
    // @ts-ignore
    return this.callRepo.findOne({
      where: [
        { callerId: userId, status: CallStatus.ACTIVE },
        { calleeId: userId, status: CallStatus.ACTIVE },
        { callerId: userId, status: CallStatus.RINGING },
        { calleeId: userId, status: CallStatus.RINGING },
        { callerId: userId, status: CallStatus.PENDING },
        { calleeId: userId, status: CallStatus.PENDING },
      ],
      relations: ['caller', 'callee'],
    });
  }

  async getPendingCallInvitation(
    userId: string
  ): Promise<CallInvitation | null> {
    // @ts-ignore
    const call = await this.callRepo.findOne({
      where: [
        { calleeId: userId, status: CallStatus.PENDING },
        { calleeId: userId, status: CallStatus.RINGING },
      ],
      relations: ['caller'],
    });

    if (!call) return null;

    return {
      callId: call.id,
      callerName: call.caller?.userName || 'Unknown',
      callerAvatarUrl: call.caller?.avatarUrl,
      isVideo: call.isVideo,
    };
  }

  async updateSdp(
    callId: string,
    userId: string,
    sdp: string,
    isOffer: boolean
  ): Promise<Call> {
    // @ts-ignore
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw ErrorHandler.notFound('Call not found');
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      throw ErrorHandler.insufficientPermissions('update', 'call');
    }

    if (isOffer) {
      call.offerSdp = sdp;
    } else {
      call.answerSdp = sdp;
    }

    return this.callRepo.save(call);
  }

  async updateIceCandidates(
    callId: string,
    userId: string,
    candidates: string
  ): Promise<Call> {
    // @ts-ignore
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw ErrorHandler.notFound('Call not found');
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      throw ErrorHandler.insufficientPermissions('update', 'call');
    }

    call.iceCandidates = candidates;
    return this.callRepo.save(call);
  }

  async setCallRinging(callId: string): Promise<Call> {
    // @ts-ignore
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (call) {
      call.status = CallStatus.RINGING;
      return this.callRepo.save(call);
    }

    throw ErrorHandler.notFound('Call not found');
  }
}

export const callsModel = new CallsModel();
