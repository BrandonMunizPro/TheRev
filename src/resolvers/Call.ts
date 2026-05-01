import { InputType, Field, ID, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg, Ctx } from 'type-graphql';
import { callsModel } from '../models/calls.model';
import { Call, CallStatus, CallInvitation } from '../entities/Call';
import { ErrorHandler } from '../errors/ErrorHandler';
import { getUserFromRequest } from '../auth/getUserFromRequest';

@InputType()
export class InitiateCallInput {
  @Field(() => ID)
  calleeId!: string;

  @Field()
  isVideo!: boolean;
}

@InputType()
export class CallSdpInput {
  @Field(() => ID)
  callId!: string;

  @Field()
  sdp!: string;

  @Field()
  isOffer!: boolean;
}

@InputType()
export class IceCandidatesInput {
  @Field(() => ID)
  callId!: string;

  @Field()
  candidates!: string;
}

@ObjectType()
export class CallOutput {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  callerId!: string;

  @Field(() => ID)
  calleeId!: string;

  @Field(() => CallStatus)
  status!: CallStatus;

  @Field()
  isVideo!: boolean;

  @Field({ nullable: true })
  offerSdp?: string;

  @Field({ nullable: true })
  answerSdp?: string;
}

@Resolver(() => Call)
export class CallResolver {
  @Query(() => CallOutput, { nullable: true })
  async getActiveCall(@Ctx() ctx: any): Promise<CallOutput | null> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    const call = await callsModel.getActiveCall(user.userId);
    if (!call) return null;

    return {
      id: call.id,
      callerId: call.callerId,
      calleeId: call.calleeId,
      status: call.status,
      isVideo: call.isVideo,
      offerSdp: call.offerSdp,
      answerSdp: call.answerSdp,
    };
  }

  @Query(() => CallInvitation, { nullable: true })
  async getPendingCallInvitation(
    @Ctx() ctx: any
  ): Promise<CallInvitation | null> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    return callsModel.getPendingCallInvitation(user.userId);
  }

  @Mutation(() => CallOutput)
  async initiateCall(
    @Arg('data') data: InitiateCallInput,
    @Ctx() ctx: any
  ): Promise<CallOutput> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    const call = await callsModel.initiateCall(
      user.userId,
      data.calleeId,
      data.isVideo
    );

    return {
      id: call.id,
      callerId: call.callerId,
      calleeId: call.calleeId,
      status: call.status,
      isVideo: call.isVideo,
    };
  }

  @Mutation(() => CallOutput)
  async acceptCall(
    @Arg('callId', () => ID) callId: string,
    @Ctx() ctx: any
  ): Promise<CallOutput> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    const call = await callsModel.acceptCall(callId, user.userId);

    return {
      id: call.id,
      callerId: call.callerId,
      calleeId: call.calleeId,
      status: call.status,
      isVideo: call.isVideo,
      offerSdp: call.offerSdp,
      answerSdp: call.answerSdp,
    };
  }

  @Mutation(() => Boolean)
  async declineCall(
    @Arg('callId', () => ID) callId: string,
    @Ctx() ctx: any
  ): Promise<boolean> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    await callsModel.declineCall(callId, user.userId);
    return true;
  }

  @Mutation(() => Boolean)
  async cancelCall(
    @Arg('callId', () => ID) callId: string,
    @Ctx() ctx: any
  ): Promise<boolean> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    await callsModel.cancelCall(callId, user.userId);
    return true;
  }

  @Mutation(() => Boolean)
  async endCall(
    @Arg('callId', () => ID) callId: string,
    @Ctx() ctx: any
  ): Promise<boolean> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    await callsModel.endCall(callId, user.userId);
    return true;
  }

  @Mutation(() => CallOutput)
  async updateCallSdp(
    @Arg('data') data: CallSdpInput,
    @Ctx() ctx: any
  ): Promise<CallOutput> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    const call = await callsModel.updateSdp(
      data.callId,
      user.userId,
      data.sdp,
      data.isOffer
    );

    return {
      id: call.id,
      callerId: call.callerId,
      calleeId: call.calleeId,
      status: call.status,
      isVideo: call.isVideo,
      offerSdp: call.offerSdp,
      answerSdp: call.answerSdp,
    };
  }

  @Mutation(() => Boolean)
  async updateIceCandidates(
    @Arg('data') data: IceCandidatesInput,
    @Ctx() ctx: any
  ): Promise<boolean> {
    const user: any = getUserFromRequest(ctx);
    if (!user || !user.userId) {
      throw ErrorHandler.notAuthenticated();
    }

    await callsModel.updateIceCandidates(
      data.callId,
      user.userId,
      data.candidates
    );
    return true;
  }
}
