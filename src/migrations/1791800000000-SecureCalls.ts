import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecureCalls1791800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE IF NOT EXISTS "call" (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      caller_id uuid NOT NULL REFERENCES "user"(id), callee_id uuid NOT NULL REFERENCES "user"(id),
      status varchar NOT NULL DEFAULT 'PENDING', started_at timestamp, ended_at timestamp,
      is_video boolean NOT NULL DEFAULT false, offer_sdp varchar, answer_sdp varchar,
      ice_candidates varchar, created_at timestamp NOT NULL DEFAULT now())`);
    await runner.query(`ALTER TABLE "call"
      ADD COLUMN IF NOT EXISTS ring_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS caller_connection_id uuid,
      ADD COLUMN IF NOT EXISTS callee_connection_id uuid,
      ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS caller_muted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS callee_muted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS caller_video_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS callee_video_enabled boolean NOT NULL DEFAULT false`);
    await runner.query(`CREATE TABLE IF NOT EXISTS call_connection (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      instance_id uuid NOT NULL, expires_at timestamptz NOT NULL, disconnected_at timestamptz)`);
    await runner.query(`CREATE TABLE IF NOT EXISTS call_signal (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), call_id uuid NOT NULL REFERENCES "call"(id) ON DELETE CASCADE,
      from_user_id uuid NOT NULL, to_user_id uuid NOT NULL, to_connection_id uuid NOT NULL,
      type varchar NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`);
    await runner.query(
      'CREATE INDEX IF NOT EXISTS idx_call_connection_user ON call_connection (user_id, expires_at)'
    );
    await runner.query(
      'CREATE INDEX IF NOT EXISTS idx_call_signal_delivery ON call_signal (to_connection_id, created_at)'
    );
    await runner.query(
      'CREATE INDEX IF NOT EXISTS idx_call_caller ON "call" (caller_id)'
    );
    await runner.query(
      'CREATE INDEX IF NOT EXISTS idx_call_callee ON "call" (callee_id)'
    );
    await runner.query(
      'CREATE INDEX IF NOT EXISTS idx_call_status ON "call" (status)'
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE IF EXISTS call_signal');
    await runner.query('DROP TABLE IF EXISTS call_connection');
    await runner.query(`ALTER TABLE "call" DROP COLUMN IF EXISTS ring_expires_at,
      DROP COLUMN IF EXISTS caller_connection_id, DROP COLUMN IF EXISTS callee_connection_id,
      DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS caller_muted, DROP COLUMN IF EXISTS callee_muted,
      DROP COLUMN IF EXISTS caller_video_enabled, DROP COLUMN IF EXISTS callee_video_enabled`);
  }
}
