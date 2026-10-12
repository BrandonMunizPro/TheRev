import {
  InputType,
  Field,
  ID,
  Int,
  ObjectType,
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
} from 'type-graphql';
import { callsModel, callView } from '../models/calls.model';
import { Call, CallStatus, CallInvitation } from '../entities/Call';
import { GraphQLContext } from '../graphql/context';
import { callActor } from '../utils/callPolicy';

@InputType()
export class InitiateCallInput {
  @Field(() => ID) calleeId!: string;
  @Field({ defaultValue: false }) isVideo!: boolean;
  @Field(() => ID, { nullable: true }) connectionId?: string;
}
@InputType()
export class CallSdpInput {
  @Field(() => ID) callId!: string;
  @Field() sdp!: string;
  @Field() isOffer!: boolean;
}
@InputType()
export class IceCandidatesInput {
  @Field(() => ID) callId!: string;
  @Field() candidates!: string;
}
@ObjectType()
export class CallOutput {
  @Field(() => ID) id!: string;
  @Field(() => ID) callerId!: string;
  @Field(() => ID) calleeId!: string;
  @Field(() => CallStatus) status!: CallStatus;
  @Field() isVideo!: boolean;
  @Field(() => Int) version!: number;
  @Field() callerName!: string;
  @Field() calleeName!: string;
  @Field({ nullable: true }) ringExpiresAt?: Date;
  @Field({ nullable: true }) startedAt?: Date;
  @Field({ nullable: true }) endedAt?: Date;
  @Field() callerMuted!: boolean;
  @Field() calleeMuted!: boolean;
  @Field() callerVideoEnabled!: boolean;
  @Field() calleeVideoEnabled!: boolean;
  @Field(() => ID, { nullable: true }) callerConnectionId?: string;
  @Field(() => ID, { nullable: true }) calleeConnectionId?: string;
  @Field({ nullable: true }) offerSdp?: string;
  @Field({ nullable: true }) answerSdp?: string;
}
function output(call: Call): CallOutput {
  return {
    ...callView(call),
    offerSdp: call.offerSdp,
    answerSdp: call.answerSdp,
  };
}
@Resolver(() => Call)
export class CallResolver {
  @Query(() => CallOutput, { nullable: true })
  async getActiveCall(@Ctx() ctx: GraphQLContext): Promise<CallOutput | null> {
    const call = await callsModel.getActiveCall(callActor(ctx));
    return call ? output(call) : null;
  }
  @Query(() => CallOutput)
  async callById(
    @Arg('callId', () => ID) callId: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<CallOutput> {
    return output(await callsModel.getCall(callId, callActor(ctx)));
  }
  @Query(() => CallInvitation, { nullable: true })
  async getPendingCallInvitation(
    @Ctx() ctx: GraphQLContext
  ): Promise<CallInvitation | null> {
    return callsModel.getPendingCallInvitation(callActor(ctx));
  }
  @Mutation(() => CallOutput)
  async initiateCall(
    @Arg('data') data: InitiateCallInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<CallOutput> {
    return output(
      await callsModel.initiateCall(
        callActor(ctx),
        data.calleeId,
        data.isVideo,
        data.connectionId
      )
    );
  }
  @Mutation(() => CallOutput)
  async acceptCall(
    @Arg('callId', () => ID) callId: string,
    @Ctx() ctx: GraphQLContext,
    @Arg('connectionId', () => ID, { nullable: true }) connectionId?: string
  ): Promise<CallOutput> {
    return output(
      await callsModel.acceptCall(callId, callActor(ctx), connectionId)
    );
  }
  @Mutation(() => Boolean)
  async declineCall(
    @Arg('callId', () => ID) id: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    await callsModel.declineCall(id, callActor(ctx));
    return true;
  }
  @Mutation(() => Boolean)
  async cancelCall(
    @Arg('callId', () => ID) id: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    await callsModel.cancelCall(id, callActor(ctx));
    return true;
  }
  @Mutation(() => Boolean)
  async endCall(
    @Arg('callId', () => ID) id: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    await callsModel.endCall(id, callActor(ctx));
    return true;
  }
  @Mutation(() => CallOutput)
  async updateCallControls(
    @Arg('callId', () => ID) id: string,
    @Ctx() ctx: GraphQLContext,
    @Arg('muted', () => Boolean, { nullable: true }) muted?: boolean,
    @Arg('videoEnabled', () => Boolean, { nullable: true })
    videoEnabled?: boolean
  ): Promise<CallOutput> {
    return output(
      await callsModel.updateControls(id, callActor(ctx), muted, videoEnabled)
    );
  }
  @Mutation(() => CallOutput)
  async updateCallSdp(
    @Arg('data') data: CallSdpInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<CallOutput> {
    return output(
      await callsModel.updateSdp(
        data.callId,
        callActor(ctx),
        data.sdp,
        data.isOffer
      )
    );
  }
  @Mutation(() => Boolean)
  async updateIceCandidates(
    @Arg('data') data: IceCandidatesInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    await callsModel.updateIceCandidates(
      data.callId,
      callActor(ctx),
      data.candidates
    );
    return true;
  }
}
