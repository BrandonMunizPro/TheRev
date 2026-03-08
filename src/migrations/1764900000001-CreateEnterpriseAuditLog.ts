import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEnterpriseAuditLog1764900000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "audit_category_enum" AS ENUM (
        'authentication', 'authorization', 'data_access', 'content',
        'ai_tasks', 'shard', 'gateway', 'security', 'compliance'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "audit_severity_enum" AS ENUM ('info', 'warning', 'critical')
    `);

    await queryRunner.query(`
      CREATE TYPE "audit_action_enum" AS ENUM (
        'create', 'read', 'update', 'delete', 'execute', 'access', 'deny'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "audit_outcome_enum" AS ENUM ('success', 'failure', 'blocked')
    `);

    await queryRunner.query(`
      CREATE TABLE "enterprise_audit_log" (
        "id" varchar(50) NOT NULL,
        "category" "audit_category_enum" NOT NULL,
        "eventType" varchar(100) NOT NULL,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid,
        "targetUserId" uuid,
        "resourceType" varchar(100),
        "resourceId" varchar(100),
        "action" "audit_action_enum" NOT NULL,
        "outcome" "audit_outcome_enum" NOT NULL,
        "ipAddress" varchar(45),
        "userAgent" varchar(500),
        "provider" varchar(50),
        "metadata" jsonb,
        "severity" "audit_severity_enum" NOT NULL DEFAULT 'info',
        "complianceFlags" text[],
        "retentionDays" integer,
        CONSTRAINT "PK_enterprise_audit_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_timestamp" ON "enterprise_audit_log" ("timestamp")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_userId" ON "enterprise_audit_log" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_category" ON "enterprise_audit_log" ("category")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_eventType" ON "enterprise_audit_log" ("eventType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_resource" ON "enterprise_audit_log" ("resourceType", "resourceId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_severity" ON "enterprise_audit_log" ("severity")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_outcome" ON "enterprise_audit_log" ("outcome")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_composite" ON "enterprise_audit_log" ("timestamp", "category", "userId")
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_alerts" (
        "id" varchar(50) NOT NULL,
        "ruleId" varchar(50) NOT NULL,
        "eventId" varchar(50) NOT NULL,
        "severity" "audit_severity_enum" NOT NULL,
        "message" text NOT NULL,
        "triggeredAt" TIMESTAMP NOT NULL DEFAULT now(),
        "acknowledgedAt" TIMESTAMP,
        "acknowledgedBy" varchar(100),
        "resolvedAt" TIMESTAMP,
        CONSTRAINT "PK_audit_alerts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_alerts_severity" ON "audit_alerts" ("severity")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_alerts_status" ON "audit_alerts" ("triggeredAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_alerts"`);
    await queryRunner.query(`DROP TABLE "enterprise_audit_log"`);
    await queryRunner.query(`DROP TYPE "audit_outcome_enum"`);
    await queryRunner.query(`DROP TYPE "audit_action_enum"`);
    await queryRunner.query(`DROP TYPE "audit_severity_enum"`);
    await queryRunner.query(`DROP TYPE "audit_category_enum"`);
  }
}
