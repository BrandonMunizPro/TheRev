// Apply only the idempotent messaging additions, without running historical seeds
// or TypeORM synchronize against an existing database.
require('ts-node/register/transpile-only');
const { AppDataSource } = require('../src/data-source');
const { LoggerFactory } = require('typeorm/logger/LoggerFactory');
const {
  MessagingReliability1791700000000,
} = require('../src/migrations/1791700000000-MessagingReliability');

async function main() {
  AppDataSource.setOptions({
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    logging: false,
  });
  AppDataSource.logger = new LoggerFactory().create(false);
  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await new MessagingReliability1791700000000().up(runner);
    await runner.commitTransaction();
    console.log('Messaging read-state table and history indexes are ready.');
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await AppDataSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
