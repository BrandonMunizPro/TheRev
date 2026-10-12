import { AppDataSource } from '../data-source';
import { Message } from '../entities/Message';
import { IsNull, SelectQueryBuilder } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from '../utils/messageCursor';
import {
  MessageEvent,
  publishMessageEvent,
} from '../services/MessageEventsService';

export type MessagePageOptions = { limit?: number; before?: string };
export type CursorMessage = Message & { cursor?: string };
export class MessagesDao {
  private get repo() {
    return AppDataSource.getRepository(Message);
  }
  async findById(id: string): Promise<Message | null> {
    return this.repo.findOne({ where: { id } });
  }

  async mutate(
    id: string,
    action: (message: Message) => Promise<'delete' | void>
  ): Promise<Message> {
    return AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Message);
      const message = await repo
        .createQueryBuilder('message')
        .where('message.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!message) throw ErrorHandler.notFound('Message', id);
      const result = await action(message);
      const event = this.event(
        message,
        result === 'delete' ? 'deleted' : 'updated'
      );
      if (result === 'delete') await repo.remove(message);
      else await repo.save(message);
      await publishMessageEvent(manager, event);
      return result === 'delete'
        ? message
        : repo.findOneOrFail({ where: { id } });
    });
  }

  private async page(
    query: SelectQueryBuilder<Message>,
    options: MessagePageOptions
  ): Promise<CursorMessage[]> {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw ErrorHandler.invalidInput(
        'Message limit must be an integer from 1 to 100'
      );
    if (options.before) {
      const cursor = decodeMessageCursor(options.before);
      query.andWhere(
        '(message.createdAt, message.id) < (CAST(:cursorTime AS timestamp), CAST(:cursorId AS uuid))',
        { cursorTime: cursor.createdAt, cursorId: cursor.id }
      );
    }
    const result = await query
      .leftJoinAndSelect('message.sender', 'sender')
      .addSelect(
        'to_char(message.createdAt, \'YYYY-MM-DD"T"HH24:MI:SS.US\')',
        'cursor_time'
      )
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(limit)
      .getRawAndEntities();
    const timestamps = new Map(
      result.raw.map((row) => [row.message_id, row.cursor_time])
    );
    return result.entities.map((message) =>
      Object.assign(message, {
        cursor: encodeMessageCursor(
          timestamps.get(message.id) as string,
          message.id
        ),
      })
    );
  }
  async findByChannel(
    channelId: string,
    options: MessagePageOptions
  ): Promise<CursorMessage[]> {
    return this.page(
      this.repo
        .createQueryBuilder('message')
        .where('message.channelId = :channelId', { channelId }),
      options
    );
  }
  async findDirectMessages(
    userId: string,
    otherUserId: string,
    options: MessagePageOptions
  ): Promise<CursorMessage[]> {
    return this.page(
      this.repo
        .createQueryBuilder('message')
        .where(
          '((message.senderId = :userId AND message.recipientId = :otherUserId) OR (message.senderId = :otherUserId AND message.recipientId = :userId))',
          { userId, otherUserId }
        )
        .andWhere(
          'message.serverId IS NULL AND message.channelId IS NULL AND message.threadId IS NULL'
        ),
      options
    );
  }
  async findConversations(userId: string): Promise<{ otherUserId: string }[]> {
    return this.repo
      .createQueryBuilder('message')
      .select(
        'DISTINCT CASE WHEN message.senderId = :userId THEN message.recipientId ELSE message.senderId END',
        'otherUserId'
      )
      .setParameter('userId', userId)
      .where(
        'message.serverId IS NULL AND message.channelId IS NULL AND message.threadId IS NULL'
      )
      .andWhere(
        '(message.senderId = :userId OR message.recipientId = :userId)',
        { userId }
      )
      .getRawMany();
  }
  async findByThread(
    threadId: string,
    options: MessagePageOptions
  ): Promise<CursorMessage[]> {
    return this.page(
      this.repo
        .createQueryBuilder('message')
        .where('message.threadId = :threadId', { threadId }),
      options
    );
  }
  private event(message: Message, kind: MessageEvent['kind']): MessageEvent {
    return {
      kind,
      messageId: message.id,
      channelId: message.channelId || undefined,
      serverId: message.serverId || undefined,
      userIds: [message.senderId, message.recipientId].filter(Boolean),
    };
  }
  async create(data: Partial<Message>): Promise<Message> {
    return AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Message);
      const message = await repo.save(repo.create(data));
      await publishMessageEvent(manager, this.event(message, 'created'));
      return repo.findOneOrFail({ where: { id: message.id } });
    });
  }
  async save(message: Message): Promise<Message> {
    return AppDataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Message).save(message);
      await publishMessageEvent(manager, this.event(saved, 'updated'));
      return saved;
    });
  }
  async remove(message: Message): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const event = this.event(message, 'deleted');
      await manager.getRepository(Message).remove(message);
      await publishMessageEvent(manager, event);
    });
  }
  async countUnread(userId: string, otherUserId: string): Promise<number> {
    return this.repo.count({
      where: {
        recipientId: userId,
        senderId: otherUserId,
        isRead: false,
        channelId: IsNull(),
        serverId: IsNull(),
        threadId: IsNull(),
      },
    });
  }
  async markDirectRead(
    userId: string,
    otherUserId: string,
    throughId: string
  ): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const [changed] = await manager.query(
        `WITH changed AS (UPDATE message SET is_read = true WHERE recipient_id = $1 AND sender_id = $2
        AND channel_id IS NULL AND server_id IS NULL AND thread_id IS NULL AND is_read = false
        AND (created_at, id) <= (SELECT created_at, id FROM message WHERE id = $3) RETURNING id)
        SELECT COUNT(*)::int AS count FROM changed`,
        [userId, otherUserId, throughId]
      );
      if (changed.count)
        await publishMessageEvent(manager, {
          kind: 'read',
          userIds: [userId, otherUserId],
        });
    });
  }
  async markChannelRead(
    userId: string,
    channelId: string,
    throughId: string
  ): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const changed = await manager.query(
        `INSERT INTO channel_read_state (user_id, channel_id, read_at, message_id)
        SELECT $1, $2, created_at, id FROM message WHERE id = $3 AND channel_id = $2
        ON CONFLICT (user_id, channel_id) DO UPDATE SET read_at = EXCLUDED.read_at, message_id = EXCLUDED.message_id
        WHERE (channel_read_state.read_at, channel_read_state.message_id) < (EXCLUDED.read_at, EXCLUDED.message_id)
        RETURNING message_id`,
        [userId, channelId, throughId]
      );
      if (changed.length)
        await publishMessageEvent(manager, {
          kind: 'read',
          userIds: [userId],
          channelId,
        });
    });
  }
  async channelUnread(userId: string, channelId: string): Promise<number> {
    const [row] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM message m
      LEFT JOIN channel_read_state r ON r.channel_id = m.channel_id AND r.user_id = $1
      WHERE m.channel_id = $2 AND m.sender_id <> $1
      AND (r.read_at IS NULL OR (m.created_at, m.id) > (r.read_at, r.message_id))`,
      [userId, channelId]
    );
    return row.count;
  }
}
