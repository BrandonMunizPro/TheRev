import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAIActionHistory1764900000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ai_action_type_enum" AS ENUM (
        'content_generation', 'content_edit', 'content_delete',
        'avatar_update', 'profile_update', 'browser_automation',
        'data_export', 'bulk_operation'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "ai_action_status_enum" AS ENUM (
        'pending', 'in_progress', 'completed', 'failed',
        'rolled_back', 'partially_rolled_back', 'cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "ai_target_type_enum" AS ENUM (
        'post', 'thread', 'avatar', 'profile', 'browser', 'data'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_actions" (
        "id" varchar(50) NOT NULL,
        "taskId" varchar(100) NOT NULL,
        "userId" uuid NOT NULL,
        "actionType" "ai_action_type_enum" NOT NULL,
        "status" "ai_action_status_enum" NOT NULL DEFAULT 'pending',
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP,
        "targetType" "ai_target_type_enum" NOT NULL,
        "targetId" varchar(100) NOT NULL,
        "previousState" jsonb,
        "newState" jsonb,
        "diff" jsonb,
        "provider" varchar(50) NOT NULL,
        "model" varchar(100),
        "tokensUsed" integer,
        "cost" decimal(10,6),
        "metadata" jsonb,
        "canRollback" boolean NOT NULL DEFAULT true,
        "requiresApproval" boolean NOT NULL DEFAULT false,
        "approvedBy" varchar(100),
        "approvedAt" TIMESTAMP,
        "rollbackTo" varchar(50),
        "relatedActions" text[],
        CONSTRAINT "PK_ai_actions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_taskId" ON "ai_actions" ("taskId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_userId" ON "ai_actions" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_actionType" ON "ai_actions" ("actionType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_status" ON "ai_actions" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_target" ON "ai_actions" ("targetType", "targetId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_timestamp" ON "ai_actions" ("timestamp")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_actions_canRollback" ON "ai_actions" ("canRollback")
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_action_versions" (
        "id" varchar(50) NOT NULL,
        "actionId" varchar(50) NOT NULL,
        "version" integer NOT NULL,
        "state" jsonb NOT NULL,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "changedBy" varchar(100) NOT NULL,
        "changeReason" varchar(500),
        CONSTRAINT "PK_ai_action_versions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_action_versions_actionId" ON "ai_action_versions" ("actionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_action_versions_version" ON "ai_action_versions" ("actionId", "version")
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_rollback_plans" (
        "id" varchar(50) NOT NULL,
        "actionId" varchar(50) NOT NULL,
        "steps" jsonb NOT NULL,
        "estimatedImpact" integer NOT NULL,
        "dependencies" text[],
        "canExecute" boolean NOT NULL,
        "reasons" text[],
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "executedAt" TIMESTAMP,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        CONSTRAINT "PK_ai_rollback_plans" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_approval_requests" (
        "id" varchar(50) NOT NULL,
        "actionId" varchar(50) NOT NULL,
        "userId" uuid NOT NULL,
        "requestedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "approverRole" varchar(50),
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "reviewedBy" varchar(100),
        "reviewedAt" TIMESTAMP,
        "reason" varchar(500),
        CONSTRAINT "PK_ai_approval_requests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_approval_requests_status" ON "ai_approval_requests" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_approval_requests"`);
    await queryRunner.query(`DROP TABLE "ai_rollback_plans"`);
    await queryRunner.query(`DROP TABLE "ai_action_versions"`);
    await queryRunner.query(`DROP TABLE "ai_actions"`);
    await queryRunner.query(`DROP TYPE "ai_target_type_enum"`);
    await queryRunner.query(`DROP TYPE "ai_action_status_enum"`);
    await queryRunner.query(`DROP TYPE "ai_action_type_enum"`);
  }
}
