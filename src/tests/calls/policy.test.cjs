require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  transitionTarget,
  validateSignal,
  callActor,
} = require('../../utils/callPolicy');
const { CallStatus } = require('../../entities/Call');
const { CallResolver } = require('../../resolvers/Call');

test('recipient-only acceptance and decline, caller-only cancellation, participant-only hang-up', () => {
  const call = {
    callerId: 'alice',
    calleeId: 'bob',
    status: CallStatus.RINGING,
  };
  assert.equal(transitionTarget(call, 'bob', 'accept'), CallStatus.ACTIVE);
  assert.equal(transitionTarget(call, 'bob', 'decline'), CallStatus.DECLINED);
  assert.equal(transitionTarget(call, 'alice', 'cancel'), CallStatus.CANCELLED);
  assert.throws(
    () => transitionTarget(call, 'alice', 'accept'),
    /Only the recipient/
  );
  assert.throws(
    () => transitionTarget(call, 'alice', 'decline'),
    /Only the recipient/
  );
  assert.throws(
    () => transitionTarget(call, 'bob', 'cancel'),
    /Only the caller/
  );
  for (const action of ['accept', 'decline', 'cancel', 'end'])
    assert.throws(() => transitionTarget(call, 'eve', action), /participant/);
  assert.throws(() => transitionTarget(call, 'alice', 'end'), /lifecycle/);
  call.status = CallStatus.ACTIVE;
  assert.equal(transitionTarget(call, 'alice', 'end'), CallStatus.ENDED);
  assert.equal(transitionTarget(call, 'bob', 'end'), CallStatus.ENDED);
});

test('terminal states cannot be resurrected and valid duplicate terminal requests are idempotent', () => {
  for (const status of [
    'ENDED',
    'DECLINED',
    'CANCELLED',
    'TIMED_OUT',
    'DISCONNECTED',
  ]) {
    const call = { callerId: 'alice', calleeId: 'bob', status };
    assert.throws(() => transitionTarget(call, 'bob', 'accept'), /lifecycle/);
  }
  assert.equal(
    transitionTarget(
      { callerId: 'alice', calleeId: 'bob', status: 'ENDED' },
      'bob',
      'end'
    ),
    'ENDED'
  );
});

test('call resolver uses the session context and rejects anonymous operations', async () => {
  assert.equal(callActor({ user: { userId: 'alice' } }), 'alice');
  assert.throws(() => callActor({}), /Authentication required/);
  const resolver = new CallResolver();
  for (const action of [
    () => resolver.getActiveCall({}),
    () => resolver.getPendingCallInvitation({}),
    () => resolver.initiateCall({ calleeId: 'bob' }, {}),
    () => resolver.acceptCall('id', {}),
    () => resolver.declineCall('id', {}),
    () => resolver.cancelCall('id', {}),
    () => resolver.endCall('id', {}),
    () => resolver.callById('id', {}),
    () => resolver.updateCallControls('id', {}, true),
    () =>
      resolver.updateCallSdp({ callId: 'id', sdp: 'sdp', isOffer: true }, {}),
    () => resolver.updateIceCandidates({ callId: 'id', candidates: '{}' }, {}),
  ])
    await assert.rejects(action, /Authentication required/);
});

test('signal validation bounds payloads and strips arbitrary routing fields', () => {
  assert.deepEqual(
    validateSignal('call:offer', { sdp: 'test SDP', toUserId: 'eve' }),
    { type: 'offer', sdp: 'test SDP' }
  );
  assert.deepEqual(
    validateSignal('call:ice-candidate', {
      candidate: 'candidate',
      sdpMid: '0',
      sdpMLineIndex: 0,
      fromUserId: 'eve',
    }),
    {
      candidate: 'candidate',
      sdpMid: '0',
      sdpMLineIndex: 0,
      usernameFragment: null,
    }
  );
  for (const [type, payload] of [
    ['call:offer', { sdp: 'x'.repeat(65537) }],
    ['call:answer', { sdp: 'sdp', type: 'offer' }],
    ['call:ice-candidate', { candidate: 'x'.repeat(4097) }],
    ['call:ice-candidate', { candidate: 'c', sdpMLineIndex: -1 }],
    ['call:ice-candidate', { candidate: 123 }],
    ['call:incoming', {}],
  ])
    assert.throws(() => validateSignal(type, payload), /Invalid/);
});

test('authenticated GraphQL cannot signal on behalf of the selected WebSocket device', async () => {
  const { buildSchema } = require('type-graphql');
  const { graphql } = require('graphql');
  const { CallsModel } = require('../../models/calls.model');
  const { AppDataSource } = require('../../data-source');
  const callId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const schema = await buildSchema({ resolvers: [CallResolver], validate: false });
  const original = AppDataSource.transaction;
  let transactions = 0;
  AppDataSource.transaction = async () => {
    transactions++;
    throw new Error('Unbound signaling must not reach database writes');
  };
  try {
    for (const source of [
      'mutation($id: ID!) { updateCallSdp(data: {callId: $id, sdp: "offer", isOffer: true}) { id } }',
      'mutation($id: ID!) { updateCallSdp(data: {callId: $id, sdp: "answer", isOffer: false}) { id } }',
      'mutation($id: ID!) { updateIceCandidates(data: {callId: $id, candidates: "{\\\"candidate\\\":\\\"test\\\"}"}) }',
    ]) {
      const result = await graphql({
        schema, source, variableValues: { id: callId },
        contextValue: { user: { userId } },
      });
      assert.equal(result.errors?.length, 1);
      assert.match(result.errors[0].message, /authenticated WebSocket connection/);
    }
    await assert.rejects(
      () => new CallsModel().sendSignal(callId, userId, 'call:offer', { sdp: 'offer' }),
      /authenticated WebSocket connection/
    );
    assert.equal(transactions, 0);
  } finally {
    AppDataSource.transaction = original;
  }
});

test('another device of either participant cannot submit signals for the selected device', async () => {
  const { CallsModel } = require('../../models/calls.model');
  const { AppDataSource } = require('../../data-source');
  const call = {
    id: '11111111-1111-4111-8111-111111111111',
    callerId: '22222222-2222-4222-8222-222222222222',
    calleeId: '33333333-3333-4333-8333-333333333333',
    callerConnectionId: '44444444-4444-4444-8444-444444444444',
    calleeConnectionId: '55555555-5555-4555-8555-555555555555',
    status: CallStatus.ACTIVE,
  };
  const otherConnection = '66666666-6666-4666-8666-666666666666';
  const original = AppDataSource.transaction;
  let writes = 0;
  const query = {
    createQueryBuilder() { return this; },
    where() { return this; },
    setLock() { return this; },
    async getOne() { return call; },
    async save() { writes++; throw new Error('Unauthorized write'); },
  };
  AppDataSource.transaction = async action => action({ getRepository: () => query });
  try {
    for (const userId of [call.callerId, call.calleeId])
      for (const [type, payload] of [
        ['call:offer', { sdp: 'offer' }],
        ['call:answer', { sdp: 'answer' }],
        ['call:ice-candidate', { candidate: 'candidate' }],
      ])
        await assert.rejects(
          () => new CallsModel().sendSignal(call.id, userId, type, payload, otherConnection),
          /selected call session/
        );
    assert.equal(writes, 0);
  } finally {
    AppDataSource.transaction = original;
  }
});
