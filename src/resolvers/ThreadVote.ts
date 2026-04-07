import {
  Resolver,
  Mutation,
  Query,
  Arg,
  Ctx,
  ObjectType,
  Field,
  Int,
} from 'type-graphql';
import { ThreadVotesDao } from '../dao/threadVotes.dao';
import { GraphQLContext } from '../graphql/context';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Perspective } from '../graphql/enums/Perspective';
import { ThreadVote } from '../entities/ThreadVote';
import { ThreadVoteCounts } from '../entities/Thread';

@Resolver(() => ThreadVote)
export class ThreadVoteResolver {
  private dao = new ThreadVotesDao();

  @Query(() => ThreadVote, { nullable: true })
  async myThreadVote(
    @Arg('threadId') threadId: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<ThreadVote | null> {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }
    return this.dao.findByUserAndThread(ctx.user.userId, threadId);
  }

  @Query(() => ThreadVoteCounts)
  async threadVoteCounts(
    @Arg('threadId') threadId: string
  ): Promise<ThreadVoteCounts> {
    const counts = await this.dao.getCountsByThread(threadId);
    return counts;
  }

  @Mutation(() => ThreadVoteResult)
  async castThreadVote(
    @Arg('threadId') threadId: string,
    @Arg('perspective', () => Perspective) perspective: Perspective,
    @Ctx() ctx: GraphQLContext
  ): Promise<ThreadVoteResult> {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }

    const existingVote = await this.dao.findByUserAndThread(
      ctx.user.userId,
      threadId
    );

    if (existingVote) {
      if (existingVote.perspective === perspective) {
        await this.dao.delete(existingVote.id);
        return { vote: null, removed: true };
      }
      existingVote.perspective = perspective;
      const updated = await this.dao.create(existingVote);
      return { vote: updated, removed: false };
    }

    const vote = await this.dao.create({
      perspective,
      user: { id: ctx.user.userId } as any,
      thread: { id: threadId } as any,
    });

    return { vote, removed: false };
  }

  @Mutation(() => Boolean)
  async removeThreadVote(
    @Arg('threadId') threadId: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }

    return this.dao.deleteByUserAndThread(ctx.user.userId, threadId);
  }
}

@ObjectType()
export class ThreadVoteResult {
  @Field(() => ThreadVote, { nullable: true })
  vote!: ThreadVote | null;

  @Field()
  removed!: boolean;
}
