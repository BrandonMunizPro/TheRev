const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Bjornmaximus11',
  database: process.env.DB_DATABASE || 'therev',
};

async function waitForDb(retries = 30) {
  console.log('⏳ Waiting for PostgreSQL...');

  for (let i = 0; i < retries; i++) {
    const client = new Client(config);

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log('✅ PostgreSQL is ready!');
      return true;
    } catch (err) {
      await client.end().catch(() => {});
      console.log(
        `   Attempt ${i + 1}/${retries} - PostgreSQL not ready yet...`
      );
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(
    '⚠️  PostgreSQL did not become ready in time, starting anyway...'
  );
  return false;
}

waitForDb();
