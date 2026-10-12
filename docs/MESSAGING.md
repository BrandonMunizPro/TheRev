# Messaging foundation (Phase 1)

Phase 1 covers authenticated text messaging, server/channel permissions, safe
display, chronological history, live updates, and read tracking. Calls remain
outside this phase. No multi-user voice channels or screen sharing were added.

## Identity and access

Every MessageResolver and ServerResolver operation requires the existing JWT
session. Legacy `userId`/`senderId` arguments remain for compatibility with the
desktop client. They must match the authenticated user; they do not grant
authority. `otherUserId` and a DM recipient identify the other participant.

- DMs can be read/reacted to only by their participants. Only the sender can edit
  or delete a DM; only the recipient can acknowledge incoming messages.
- Channel history, individual message reads, reactions, and read markers require
  current server membership. Sending requires an actual channel; the server is
  derived from that channel. Mixed channel/DM destinations and mismatched servers
  are rejected. Standalone `threadId` destinations are rejected; discussion
  channels (`THREAD`) remain supported.
- Senders can edit their own channel messages while authorized to post. Senders
  and server owners/admins/moderators can delete channel messages. Announcement
  posting requires staff; voice channels reject text.
- Owners/admins create or delete channels and invite members. Only owners delete
  servers. Joining or leaving acts on the session user. Private servers require
  an invitation. `inviteServerMember(data: JoinServerInput!)` preserves the
  existing desktop add-member flow while checking the inviter's role.
- Private servers are excluded from discovery for nonmembers. Channel details
  and message history require membership even in public servers.

Message display uses text nodes and safe HTTP(S) links. Newlines are preserved;
HTML is displayed as literal text. Names, previews, channel names, reactions, and
profile image attributes are also rendered without interpolating user HTML.

## History and read state

`getDirectMessages` and `getChannelMessages` retain their list result and return
a `cursor` on each message. Supply the oldest returned cursor as `before` for
the next page. Cursors contain an exact PostgreSQL timestamp (microseconds) and
UUID tie breaker. Results sort descending by `(created_at, id)`. The timestamp
continues to work when the boundary message is deleted. Limits are integers
between 1 and 100. Legacy bare-UUID `before` values are no longer accepted.

`markConversationRead(throughMessageId: ID!, channelId: ID, otherUserId: ID)`
requires exactly one conversation target and a message in that conversation.
Only received DMs up to that boundary become read. Channel read positions are
stored per user/channel in `channel_read_state` and can only move forward.
Deleting the boundary message does not erase the channel read position.

The desktop marks the latest loaded boundary when the messages section is
visible and the window is focused. Focus changes acknowledge newly visible
conversations. Background conversations remain unread. Read events update badges
and sender read receipts across connected sessions.

## Live delivery and deployment

The API exposes `GET /api/messages/events` as an authenticated SSE stream. The
desktop uses streaming `fetch` with the JWT in the Authorization header; tokens
are never placed in event-stream URLs. Token expiry is checked on events and
heartbeats. Each channel invalidation rechecks current membership before being
sent. Events contain IDs and scope, never message bodies.

PostgreSQL LISTEN/NOTIFY shares invalidations across API processes. Notifications
are published in the same database transaction as message writes/read changes.
The API listener and client reconnect automatically. A `ready` event triggers
history and unread-count reconciliation after initial connection or reconnect.
History is the source of truth; NOTIFY is not a durable event log. Reconciliation
also updates already-loaded older messages after edits or deletion.

Required existing configuration:

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`: PostgreSQL
  connection. Use the primary database, not a read replica. The dedicated LISTEN
  connection must connect directly or through **session** pooling. PgBouncer
  transaction pooling does not support this persistent listener.
- `JWT_SECRET_KEY`: existing JWT signing/verification secret, supplied through
  deployment configuration. Never commit it.
- `MESSAGE_ALLOWED_ORIGINS`: optional comma-separated origins permitted to read
  the SSE endpoint. The local default is `null,http://localhost:4000`, covering
  the current Electron file-based renderer. Set explicit web origins when
  deploying a browser client.

Reverse proxies must allow Authorization headers, disable buffering/compression
for SSE, and allow long-lived responses with a timeout exceeding the 15-second
heartbeat. Use HTTPS for internet-facing API traffic. Limit connections and
requests at the reverse proxy; this service caps concurrent streams at 1000 and
closes slow consumers rather than buffering indefinitely.

The desktop currently uses the project's existing `localhost:4000` API target.
Remote API endpoint configuration, authenticated call signaling, and STUN/TURN
configuration belong to the later explicitly approved calling phases. No TURN
credentials or calling connectivity claims are part of Phase 1.

## Database rollout

Apply `1791700000000-MessagingReliability.ts` through the established migration
workflow on an already-baselined database. For the existing local database,
`npm run db:messaging:prepare` applies only these idempotent additions in one
transaction, without replaying historical seed migrations or synchronizing
unrelated tables. It creates the per-channel read table and chronological
history indexes. Existing messages are not rewritten. Large production message
tables may require scheduling index creation during a maintenance window.

The Notification entity is now registered in the existing data source so DM
notifications can use the existing notification DAO. The historical notification
table migration must already be applied in production. A notification delivery
failure does not turn a successfully stored message into a failed send response.

## Verification

- `npm run test:messaging`: authorization/impersonation tests plus real headless
  Chromium tests for XSS, safe links/newlines, channel/DM routing, stale responses,
  chronological display, and read-boundary acknowledgements. Requires the
  project's Playwright Chromium installation.
- `npm run test:messaging:db`: real GraphQL/resolver/model/database tests plus an
  authenticated HTTP SSE test using PostgreSQL NOTIFY. Requires the configured
  local PostgreSQL instance and privileges to create/drop a disposable schema.
  Tests use a validated `messaging_test_<timestamp>_<pid>` schema, remove only
  that schema, and check existing public message counts remain unchanged.
- `node node_modules/typescript/bin/tsc --noEmit`: relevant TypeScript check.

Manual Electron testing with two accounts remains useful for layout, scrolling,
background/focus behavior, proxy disconnects, and a busy conversation with long
history. No real audio/video call has been implemented or tested in this phase.

## Phase 1 file manifest

| Area | Files |
| --- | --- |
| API and business rules | `src/resolvers/Message.ts`, `src/resolvers/Server.ts`, `src/models/messages.model.ts`, `src/dao/messages.dao.ts` |
| Shared authorization and live delivery | `src/services/MessagingAccess.ts`, `src/services/MessageEventsService.ts`, `src/utils/messageCursor.ts`, `src/index.ts` |
| Database | `src/entities/Message.ts`, `src/entities/ChannelReadState.ts`, `src/data-source.ts`, `src/migrations/1791700000000-MessagingReliability.ts` |
| Desktop | `src/electron/frontend/app.js`, `src/electron/frontend/messaging/MessagingUI.js`, `src/electron/frontend/messaging/MessagingController.js` |
| Tests | `src/tests/messaging/security.test.cjs`, `src/tests/messaging/database.test.cjs`, `src/tests/messaging/frontend.test.cjs` |
| Rollout and commands | `scripts/prepare-messaging-db.cjs`, `package.json`, `docs/MESSAGING.md` |

Earlier analytics edits and unrelated workspace artifacts are separate from this phase.

Development is paused as of 2026-10-12 while work returns to HistoricalGame.
See the [development checkpoint in CALLS.md](CALLS.md#development-checkpoint--2026-10-12)
for verified checks, outstanding validation, known issues, and the next milestone.
