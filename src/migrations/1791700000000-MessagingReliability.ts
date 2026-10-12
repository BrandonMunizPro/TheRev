import { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagingReliability1791700000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE IF NOT EXISTS channel_read_state (
      user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      channel_id uuid NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
      read_at timestamp NOT NULL, message_id uuid NOT NULL,
      PRIMARY KEY (user_id, channel_id))`);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_message_channel_history ON message (channel_id, created_at DESC, id DESC)`
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_message_dm_history ON message (sender_id, recipient_id, created_at DESC, id DESC)`
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX IF EXISTS idx_message_dm_history');
    await runner.query('DROP INDEX IF EXISTS idx_message_channel_history');
    await runner.query('DROP TABLE IF EXISTS channel_read_state');
  }
}
