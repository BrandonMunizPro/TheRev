require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { LoggerFactory } = require('typeorm/logger/LoggerFactory');
const { AppDataSource } = require('../../data-source');
const { User } = require('../../entities/User');
const { Server, ServerType } = require('../../entities/Server');
const { Channel, ChannelType } = require('../../entities/Channel');
const { ServerMember, ServerRole } = require('../../entities/ServerMember');
const { Message } = require('../../entities/Message');
const { ChannelReadState } = require('../../entities/ChannelReadState');
const { Notification } = require('../../entities/Notification');
const { MessagesModel } = require('../../models/messages.model');
const { MessagesDao } = require('../../dao/messages.dao');
const { MessageResolver } = require('../../resolvers/Message');
const { ServerResolver } = require('../../resolvers/Server');
const { messageEventsService } = require('../../services/MessageEventsService');
const {
  MessagingReliability1791700000000,
} = require('../../migrations/1791700000000-MessagingReliability');

test(
  'messaging against PostgreSQL in a disposable isolated schema',
  { skip: process.env.RUN_MESSAGING_DB_TESTS !== '1', timeout: 90000 },
  async (t) => {
    const schema = `messaging_test_${Date.now()}_${process.pid}`;
    assert.match(schema, /^messaging_test_\d+_\d+$/);
    const options = AppDataSource.options;
    const admin = new Client({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
      ssl: options.ssl,
      connectionTimeoutMillis: 5000,
    });
    await admin.connect();
    const [snapshot] = (
      await admin.query('SELECT COUNT(*)::int AS count FROM public.message')
    ).rows;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    try {
      AppDataSource.setOptions({
        schema,
        entities: [
          User,
          Server,
          Channel,
          ServerMember,
          Message,
          ChannelReadState,
          Notification,
        ],
        migrations: [],
        synchronize: true,
        logging: false,
        installExtensions: false,
        extra: { options: `-c search_path=${schema},public` },
      });
      AppDataSource.logger = new LoggerFactory().create(false);
      await AppDataSource.initialize();
      const runner = AppDataSource.createQueryRunner();
      await runner.connect();
      await new MessagingReliability1791700000000().up(runner);
      await runner.release();
      const users = {};
      for (const name of ['alice', 'bob', 'eve', 'moderator']) {
        users[name] = await AppDataSource.getRepository(User).save({
          userName: name,
          firstName: name,
          lastName: 'Test',
          email: `${name}@example.invalid`,
          password: 'test-only',
        });
      }
      const ctx = (name) => ({
        user: { userId: users[name].id, role: users[name].role },
      });
      const serverResolver = new ServerResolver();
      const resolver = new MessageResolver();
      const model = new MessagesModel();
      const dao = new MessagesDao();
      const server = await serverResolver.createServer(
        ctx('alice'),
        { name: 'Test', type: ServerType.PRIVATE },
        users.alice.id
      );
      const channel = server.channels[0];
      await serverResolver.inviteServerMember(ctx('alice'), {
        serverId: server.id,
        userId: users.bob.id,
      });
      await AppDataSource.getRepository(ServerMember).save({
        serverId: server.id,
        userId: users.moderator.id,
        role: ServerRole.MODERATOR,
      });

      await t.test(
        'anonymous and impersonated GraphQL requests cannot read or send messages',
        async () => {
          const { buildSchema } = require('type-graphql');
          const { graphql } = require('graphql');
          const api = await buildSchema({
            resolvers: [MessageResolver, ServerResolver],
            validate: false,
          });
          const query =
            'query($a: ID!, $b: ID!) { getDirectMessages(userId: $a, otherUserId: $b) { id } }';
          const variables = { a: users.alice.id, b: users.bob.id };
          const anonymous = await graphql({
            schema: api,
            source: query,
            variableValues: variables,
            contextValue: {},
          });
          assert.match(anonymous.errors[0].message, /Authentication required/);
          const spoofed = await graphql({
            schema: api,
            source: query,
            variableValues: variables,
            contextValue: ctx('eve'),
          });
          assert.match(spoofed.errors[0].message, /mismatch/);
          const mutation =
            'mutation($sender: ID!, $recipient: ID!) { sendMessage(senderId: $sender, data: {content: "spoof", recipientId: $recipient}) { id } }';
          const result = await graphql({
            schema: api,
            source: mutation,
            variableValues: { sender: users.alice.id, recipient: users.bob.id },
            contextValue: ctx('eve'),
          });
          assert.match(result.errors[0].message, /mismatch/);
          assert.equal(await AppDataSource.getRepository(Message).count(), 0);
        }
      );

      let dm, posted;
      await t.test(
        'DM and channel messages retain the correct destination and sender',
        async () => {
          dm = await resolver.sendMessage(ctx('alice'), users.alice.id, {
            content: 'hello bob',
            recipientId: users.bob.id,
          });
          posted = await resolver.sendMessage(ctx('alice'), users.alice.id, {
            content: 'hello channel',
            channelId: channel.id,
          });
          assert.equal(posted.serverId, server.id);
          assert.equal(dm.channelId, undefined);
          assert.equal(dm.serverId, undefined);
          assert.equal(
            (
              await resolver.getDirectMessages(
                ctx('bob'),
                users.bob.id,
                users.alice.id
              )
            ).length,
            1
          );
          assert.equal(
            (await resolver.getChannelMessages(ctx('bob'), channel.id)).length,
            1
          );
        }
      );

      await t.test(
        'nonmembers cannot read, send, edit, delete, or react in a channel',
        async () => {
          for (const action of [
            () => model.getChannelMessages(channel.id, {}, users.eve.id),
            () =>
              model.sendMessage(users.eve.id, 'denied', {
                channelId: channel.id,
              }),
            () => model.editMessage(posted.id, users.eve.id, 'denied'),
            () => model.deleteMessage(posted.id, users.eve.id),
            () => model.addReaction(posted.id, users.eve.id, 'x'),
          ])
            await assert.rejects(action, /membership/);
        }
      );

      await t.test(
        'unrelated DM users cannot read, edit, delete, react, or mark read',
        async () => {
          for (const action of [
            () => model.getMessage(dm.id, users.eve.id),
            () => model.editMessage(dm.id, users.eve.id, 'denied'),
            () => model.deleteMessage(dm.id, users.eve.id),
            () => model.addReaction(dm.id, users.eve.id, 'x'),
            () => model.markAsRead(dm.id, users.eve.id),
          ])
            await assert.rejects(action, /participant/);
          await assert.rejects(
            () => model.editMessage(dm.id, users.bob.id, 'denied'),
            /Only the sender/
          );
          await assert.rejects(
            () => model.deleteMessage(dm.id, users.bob.id),
            /Only the sender/
          );
        }
      );

      await t.test(
        'message edits and reactions are authorized and concurrency preserves reactions',
        async () => {
          await model.editMessage(dm.id, users.alice.id, 'edited');
          await Promise.all([
            model.addReaction(dm.id, users.alice.id, 'a'),
            model.addReaction(dm.id, users.bob.id, 'b'),
          ]);
          const message = await model.getMessage(dm.id, users.bob.id);
          assert.equal(message.content, 'edited');
          assert.equal(message.reactions.length, 2);
        }
      );

      await t.test(
        'ordinary members cannot manage channels, invite users, or join private servers',
        async () => {
          await assert.rejects(
            () =>
              serverResolver.createChannel(
                ctx('bob'),
                { serverId: server.id, name: 'denied', type: ChannelType.TEXT },
                users.bob.id
              ),
            /administrator/
          );
          await assert.rejects(
            () =>
              serverResolver.inviteServerMember(ctx('bob'), {
                serverId: server.id,
                userId: users.eve.id,
              }),
            /administrator/
          );
          await assert.rejects(
            () =>
              serverResolver.joinServer(ctx('eve'), {
                serverId: server.id,
                userId: users.eve.id,
              }),
            /invitation/
          );
          await assert.rejects(
            () => serverResolver.getServer(ctx('eve'), server.id, users.eve.id),
            /membership/
          );
          assert.equal(
            (await serverResolver.getServers(ctx('eve'))).some(
              (s) => s.id === server.id
            ),
            false
          );
          assert.equal(
            (await serverResolver.searchServers(ctx('eve'), 'Test')).length,
            0
          );
        }
      );

      await t.test(
        'concurrent invitations create one membership and failed server creation rolls back',
        async () => {
          await Promise.all([
            serverResolver.inviteServerMember(ctx('alice'), {
              serverId: server.id,
              userId: users.eve.id,
            }),
            serverResolver.inviteServerMember(ctx('alice'), {
              serverId: server.id,
              userId: users.eve.id,
            }),
          ]);
          assert.equal(
            await AppDataSource.getRepository(ServerMember).count({
              where: { serverId: server.id, userId: users.eve.id },
            }),
            1
          );
          await serverResolver.leaveServer(ctx('eve'), server.id, users.eve.id);
          const before = await AppDataSource.getRepository(Server).count();
          await assert.rejects(() =>
            serverResolver.createServer(
              { user: { userId: randomUUID() } },
              { name: 'invalid owner' },
              undefined
            )
          );
          assert.equal(
            await AppDataSource.getRepository(Server).count(),
            before
          );
        }
      );

      await t.test(
        'announcement posting requires staff and moderators can delete channel messages',
        async () => {
          const announcement = await serverResolver.createChannel(
            ctx('alice'),
            {
              serverId: server.id,
              name: 'announcements',
              type: ChannelType.ANNOUNCEMENT,
            },
            users.alice.id
          );
          await assert.rejects(
            () =>
              model.sendMessage(users.bob.id, 'denied', {
                channelId: announcement.id,
              }),
            /staff/
          );
          await model.sendMessage(users.alice.id, 'announcement', {
            channelId: announcement.id,
          });
          const disposable = await model.sendMessage(
            users.bob.id,
            'moderate me',
            { channelId: channel.id }
          );
          await model.deleteMessage(disposable.id, users.moderator.id);
          assert.equal(await dao.findById(disposable.id), null);
        }
      );

      await t.test(
        'history cursors preserve microseconds, timestamp ties, and survive anchor deletion',
        async () => {
          const pageChannel = await serverResolver.createChannel(
            ctx('alice'),
            { serverId: server.id, name: 'history', type: ChannelType.TEXT },
            users.alice.id
          );
          const ids = [
            randomUUID(),
            randomUUID(),
            randomUUID(),
            randomUUID(),
            randomUUID(),
          ];
          const times = [
            '2026-01-01 00:00:00.100001',
            '2026-01-01 00:00:00.100002',
            '2026-01-01 00:00:00.100002',
            '2026-01-02 00:00:00.000000',
            '2026-01-03 00:00:00.000000',
          ];
          for (let i = 0; i < ids.length; i++)
            await AppDataSource.query(
              'INSERT INTO message (id, sender_id, content, channel_id, server_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
              [
                ids[i],
                users.alice.id,
                `history ${i}`,
                pageChannel.id,
                server.id,
                times[i],
              ]
            );
          const first = await model.getChannelMessages(
            pageChannel.id,
            { limit: 2 },
            users.bob.id
          );
          await AppDataSource.getRepository(Message).delete(first[1].id);
          const second = await model.getChannelMessages(
            pageChannel.id,
            { limit: 2, before: first[1].cursor },
            users.bob.id
          );
          const third = await model.getChannelMessages(
            pageChannel.id,
            { limit: 2, before: second[1].cursor },
            users.bob.id
          );
          const seen = [...first, ...second, ...third].map((m) => m.id);
          assert.equal(new Set(seen).size, 5);
          assert.equal(
            second[0].createdAt.getTime(),
            second[1].createdAt.getTime()
          );
          assert.notEqual(second[0].cursor, second[1].cursor);
          await assert.rejects(
            () =>
              model.getChannelMessages(
                pageChannel.id,
                { limit: 101 },
                users.bob.id
              ),
            /limit/
          );
          await assert.rejects(
            () =>
              model.getChannelMessages(
                pageChannel.id,
                { before: 'invalid' },
                users.bob.id
              ),
            /cursor/
          );
        }
      );

      await t.test(
        'read tracking clears only received messages through the visible chronological boundary',
        async () => {
          const later = await model.sendMessage(
            users.alice.id,
            'later unread',
            { recipientId: users.bob.id }
          );
          assert.equal(await dao.countUnread(users.bob.id, users.alice.id), 2);
          await model.markConversationRead(
            users.bob.id,
            dm.id,
            undefined,
            users.alice.id
          );
          assert.equal(await dao.countUnread(users.bob.id, users.alice.id), 1);
          assert.equal((await dao.findById(later.id)).isRead, false);
          await assert.rejects(
            () =>
              model.markConversationRead(
                users.bob.id,
                posted.id,
                undefined,
                users.alice.id
              ),
            /DM/
          );
          await model.markConversationRead(
            users.bob.id,
            later.id,
            undefined,
            users.alice.id
          );
          assert.equal(await dao.countUnread(users.bob.id, users.alice.id), 0);
        }
      );

      await t.test(
        'channel read markers are per-user, monotonic, and independent between channels',
        async () => {
          const newer = await model.sendMessage(
            users.alice.id,
            'new channel message',
            { channelId: channel.id }
          );
          assert.equal(await dao.channelUnread(users.bob.id, channel.id), 2);
          await model.markConversationRead(users.bob.id, posted.id, channel.id);
          assert.equal(await dao.channelUnread(users.bob.id, channel.id), 1);
          await model.markConversationRead(users.bob.id, newer.id, channel.id);
          await model.markConversationRead(users.bob.id, posted.id, channel.id);
          assert.equal(await dao.channelUnread(users.bob.id, channel.id), 0);
          assert.equal(
            await dao.channelUnread(users.moderator.id, channel.id),
            2
          );
          await assert.rejects(
            () => model.markConversationRead(users.bob.id, dm.id, channel.id),
            /channel/
          );
        }
      );

      await t.test(
        'authenticated HTTP live stream delivers committed database changes and rejects anonymous connections',
        async () => {
          const express = require('express');
          const jwt = require('jsonwebtoken');
          process.env.JWT_SECRET_KEY = 'isolated-test-signing-secret';
          const app = express();
          app.get('/events', messageEventsService.connect);
          const http = await new Promise((resolve) => {
            const server = app.listen(0, '127.0.0.1', () => resolve(server));
          });
          const address = `http://127.0.0.1:${http.address().port}/events`;
          const abort = new AbortController();
          try {
            assert.equal((await fetch(address)).status, 401);
            const expired = jwt.sign(
              { userId: users.bob.id },
              process.env.JWT_SECRET_KEY,
              { expiresIn: -1 }
            );
            assert.equal(
              (
                await fetch(address, {
                  headers: { Authorization: `Bearer ${expired}` },
                })
              ).status,
              401
            );
            await messageEventsService.start();
            const token = jwt.sign(
              { userId: users.bob.id, role: users.bob.role },
              process.env.JWT_SECRET_KEY,
              { expiresIn: '1m' }
            );
            const response = await fetch(address, {
              headers: { Authorization: `Bearer ${token}` },
              signal: abort.signal,
            });
            assert.equal(response.status, 200);
            const reader = response.body.getReader();
            await reader.read(); // Ready frame.
            const received = reader.read();
            const sent = await model.sendMessage(users.alice.id, 'live DM', {
              recipientId: users.bob.id,
            });
            const packet = await Promise.race([
              received,
              new Promise((_, reject) => {
                const timer = setTimeout(
                  () => reject(new Error('Live event timed out')),
                  5000
                );
                timer.unref();
              }),
            ]);
            const event = new TextDecoder().decode(packet.value);
            assert.match(event, /event: message/);
            assert.ok(event.includes(sent.id));
            assert.equal(event.includes('live DM'), false); // No message content travels in invalidations.
            assert.equal(
              await messageEventsService.canReceive(users.eve.id, {
                kind: 'created',
                userIds: [users.alice.id, users.bob.id],
              }),
              false
            );
            await AppDataSource.getRepository(ServerMember).delete({
              serverId: server.id,
              userId: users.bob.id,
            });
            assert.equal(
              await messageEventsService.canReceive(users.bob.id, {
                kind: 'created',
                channelId: channel.id,
                serverId: server.id,
              }),
              false
            );
          } finally {
            abort.abort();
            await messageEventsService.stop();
            await new Promise((resolve) => http.close(resolve));
          }
        }
      );

      await t.test(
        'rolled-back database changes do not publish live events',
        async () => {
          const {
            publishMessageEvent,
          } = require('../../services/MessageEventsService');
          await messageEventsService.start();
          const seen = [];
          const record = (event) => seen.push(event);
          messageEventsService.on('change', record);
          const runner = AppDataSource.createQueryRunner();
          try {
            await runner.connect();
            await runner.startTransaction();
            await publishMessageEvent(runner.manager, {
              kind: 'created',
              messageId: 'rolled-back',
            });
            await runner.rollbackTransaction();
            const delivered = new Promise((resolve) =>
              messageEventsService.once('change', resolve)
            );
            await publishMessageEvent(AppDataSource.manager, {
              kind: 'created',
              messageId: 'committed-after-rollback',
            });
            const committed = await delivered;
            assert.equal(committed.messageId, 'committed-after-rollback');
            assert.equal(
              seen.some((event) => event.messageId === 'rolled-back'),
              false
            );
          } finally {
            messageEventsService.off('change', record);
            await runner.release();
            await messageEventsService.stop();
          }
        }
      );

      await t.test(
        'server deletion cleans messages and channel read markers transactionally',
        async () => {
          await serverResolver.deleteServer(
            ctx('alice'),
            server.id,
            users.alice.id
          );
          assert.equal(await AppDataSource.getRepository(Channel).count(), 0);
          assert.equal(
            await AppDataSource.getRepository(ChannelReadState).count(),
            0
          );
          assert.equal(
            await AppDataSource.getRepository(Message).count({
              where: { serverId: server.id },
            }),
            0
          );
          assert.ok(await dao.findById(dm.id));
        }
      );
    } finally {
      await messageEventsService.stop();
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      // The identifier is generated and validated above; never drop public or user-selected schemas.
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      const [after] = (
        await admin.query('SELECT COUNT(*)::int AS count FROM public.message')
      ).rows;
      assert.deepEqual(
        after,
        snapshot,
        'Existing message records must remain unchanged'
      );
      await admin.end();
    }
  }
);
