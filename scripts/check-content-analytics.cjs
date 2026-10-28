// Verify existing records without schema synchronization or database writes.
require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { AppDataSource } = require('../src/data-source');
const { ThreadsModel } = require('../src/models/threads.model');
const { ThreadVotesDao } = require('../src/dao/threadVotes.dao');
const { UserResolver } = require('../src/resolvers/User');
const { LoggerFactory } = require('typeorm/logger/LoggerFactory');

async function main() {
  AppDataSource.setOptions({
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    logging: false,
    extra: { ...AppDataSource.options.extra, options: '-c default_transaction_read_only=on' },
  });
  AppDataSource.logger = new LoggerFactory().create(false);
  await AppDataSource.initialize();
  try {
    const [mode] = await AppDataSource.query('SHOW default_transaction_read_only');
    assert.equal(mode.default_transaction_read_only, 'on');
    const users = await AppDataSource.query('SELECT id FROM "user"');
    const threads = await AppDataSource.query('SELECT id FROM thread');
    const model = new ThreadsModel();
    const votesDao = new ThreadVotesDao();
    const resolver = new UserResolver();
    let posts = 0, replies = 0, votes = 0, duplicateReplyAppearances = 0;
    for (const user of users) {
      const [expected] = await AppDataSource.query(`
        SELECT (SELECT COUNT(*)::int FROM thread WHERE "authorId" = $1) AS threads,
          COUNT(*) FILTER (WHERE "parentId" IS NULL)::int AS posts,
          COUNT(*) FILTER (WHERE "parentId" IS NOT NULL)::int AS replies
        FROM post WHERE "authorId" = $1`, [user.id]);
      const actual = await resolver.getUserStats(user.id);
      assert.deepEqual(actual, expected, 'Profile totals must match stored rows');
      posts += actual.posts;
      replies += actual.replies;
    }
    const expectedVotes = new Map();
    for (const thread of threads) {
      const [expected] = await AppDataSource.query(`
        SELECT COUNT(*) FILTER (WHERE perspective = 'PRO')::int AS "PRO",
          COUNT(*) FILTER (WHERE perspective = 'AGAINST')::int AS "AGAINST",
          COUNT(*) FILTER (WHERE perspective = 'NEUTRAL')::int AS "NEUTRAL",
          COUNT(*)::int AS total FROM thread_vote WHERE "threadId" = $1`, [thread.id]);
      const actual = await model.getThread({ id: thread.id });
      assert.deepEqual(actual.voteCounts, expected, 'Thread votes must match stored vote rows');
      assert.deepEqual(await votesDao.getCountsByThread(thread.id), expected);
      expectedVotes.set(thread.id, expected);
      votes += expected.total;
      const flatIds = new Set(actual.posts.map(post => post.id));
      for (const post of actual.posts) {
        for (const reply of post.replies || []) {
          if (flatIds.has(reply.id)) duplicateReplyAppearances++;
        }
      }
    }
    if (users.length) {
      const list = await model.listAllThreads(users[0].id);
      assert.equal(list.length, threads.length);
      for (const thread of list) assert.deepEqual(thread.voteCounts, expectedVotes.get(thread.id));
    }
    const [integrity] = await AppDataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM post p JOIN post parent ON parent.id = p."parentId"
          WHERE p."threadId" <> parent."threadId") AS cross_thread_replies,
        (SELECT COUNT(*)::int FROM (
          SELECT "userId", "threadId" FROM thread_vote GROUP BY "userId", "threadId" HAVING COUNT(*) > 1
        ) duplicates) AS duplicate_votes,
        (SELECT COUNT(*)::int FROM thread_vote WHERE perspective NOT IN ('PRO', 'AGAINST', 'NEUTRAL') OR perspective IS NULL) AS invalid_votes`);
    assert.deepEqual(integrity, { cross_thread_replies: 0, duplicate_votes: 0, invalid_votes: 0 });
    console.log(JSON.stringify({ verifiedUsers: users.length, verifiedThreads: threads.length,
      topLevelPosts: posts, replies, totalPostRows: posts + replies, votes,
      duplicateReplyAppearances, integrity }, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
