const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'src/electron/frontend/app.js'), 'utf8');
function method(name, next, globals) {
  const start = source.indexOf('  ' + name + '(');
  const end = source.indexOf(next, start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext('({' + source.slice(start, end).trim() + '})', globals);
}
function elements() {
  const values = {};
  return { values, document: { getElementById: id => values[id] ||= { textContent: '' } } };
}
test('profile totals include old activity and populate all three counters', async () => {
  const dom = elements();
  const app = method('async loadProfileStats', '  // Store 3D viewer', {
    document: dom.document, console,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.variables.userId, 'user');
      assert.match(body.query, /getUserStats/);
      return { json: async () => ({ data: { getUserStats: { threads: 35, posts: 80, replies: 50 } } }) };
    },
  });
  Object.assign(app, { jwtToken: 'token', currentUser: { id: 'user' } });
  await app.loadProfileStats();
  assert.equal(dom.values['stat-threads'].textContent, 35);
  assert.equal(dom.values['stat-posts'].textContent, 80);
  assert.equal(dom.values['stat-replies'].textContent, 50);
});
test('vote refresh uses fresh totals without overwriting post filters', async () => {
  const dom = elements();
  dom.document.getElementById('count-all').textContent = 7;
  let count = 1;
  const app = method('async loadThreadVotes', '  async castVote(', {
    document: dom.document, console,
    fetch: async () => ({ json: async () => ({ data: { threadVoteCounts: { PRO: count, AGAINST: 0, NEUTRAL: 0, total: count } } }) }),
  });
  app._currentThread = { id: 'thread', voteCounts: { total: 99 } };
  await app.loadThreadVotes('thread');
  assert.equal(dom.values['vote-total'].textContent, 1);
  count = 0;
  await app.loadThreadVotes('thread');
  assert.equal(dom.values['vote-total'].textContent, 0);
  assert.equal(dom.values['count-all'].textContent, 7);
});
test('late vote response cannot overwrite another thread', async () => {
  const dom = elements();
  const app = method('async loadThreadVotes', '  async castVote(', {
    document: dom.document, console,
    fetch: async () => {
      app._currentThread = { id: 'other' };
      return { json: async () => ({ data: { threadVoteCounts: { total: 20 } } }) };
    },
  });
  app._currentThread = { id: 'thread' };
  await app.loadThreadVotes('thread');
  assert.equal(dom.values['vote-total'], undefined);
});
test('all thread read paths return votes without counting flat and nested replies', async () => {
  const counts = { PRO: 1, AGAINST: 0, NEUTRAL: 0, total: 1 };
  const reply = { id: 'reply', perspective: 'PRO' };
  const thread = { id: 'thread', posts: [{ id: 'post', perspective: 'NEUTRAL', replies: [reply] }, reply] };
  class ThreadsDao {
    async getVoteCountsForThreads() { return new Map([['thread', counts]]); }
    async findByIdWithReplies() { return thread; }
    async findAllWithMetadata() { return [thread]; }
    async findAllByUserId() { return [thread]; }
    async findThreadsUserParticipatedIn() { return [thread]; }
  }
  class UsersDao { async findById() { return { id: 'user' }; } }
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/models/threads.model.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, console: { log() {} }, require: () => ({ ThreadsDao, UsersDao, PostsDao: class {}, PermissionsService: class {} }) });
  const model = new exports.ThreadsModel();
  assert.deepEqual((await model.getThread({ id: 'thread' })).voteCounts, counts);
  for (const result of [await model.listAllThreads('user'), await model.listThreadsByUser('user', 'user'), await model.listThreadsUserParticipatedIn('user'), await model.listUserParticipatedIn('user')]) {
    assert.deepEqual(result[0].voteCounts, counts);
  }
});
