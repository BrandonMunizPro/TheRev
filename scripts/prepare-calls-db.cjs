require('ts-node/register/transpile-only');
const { AppDataSource } = require('../src/data-source');
const { LoggerFactory } = require('typeorm/logger/LoggerFactory');
const {
  SecureCalls1791800000000,
} = require('../src/migrations/1791800000000-SecureCalls');

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
    await new SecureCalls1791800000000().up(runner);
    await runner.commitTransaction();
    console.log(
      'Secure call lifecycle columns, connection leases, and signaling queue are ready.'
    );
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
