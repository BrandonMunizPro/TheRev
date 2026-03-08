import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSecurityTables1764900000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "incident_type_enum" AS ENUM (
        'security_breach', 'data_loss', 'service_outage',
        'performance_degradation', 'compliance_violation',
        'unauthorized_access', 'rate_limit_exceeded', 'ai_abuse'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "incident_severity_enum" AS ENUM ('low', 'medium', 'high', 'critical')
    `);

    await queryRunner.query(`
      CREATE TYPE "incident_status_enum" AS ENUM (
        'detected', 'investigating', 'contained', 'eradicated', 'recovered', 'closed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "incidents" (
        "id" varchar(50) NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "type" "incident_type_enum" NOT NULL,
        "severity" "incident_severity_enum" NOT NULL,
        "status" "incident_status_enum" NOT NULL DEFAULT 'detected',
        "discoveredAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reportedBy" varchar(100),
        "assignedTo" varchar(100),
        "affectedSystems" text[],
        "affectedUsers" text[],
        "timeline" jsonb NOT NULL DEFAULT '[]',
        "rootCause" text,
        "resolution" text,
        "lessonsLearned" text,
        "closedAt" TIMESTAMP,
        CONSTRAINT "PK_incidents" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_incidents_status" ON "incidents" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_incidents_severity" ON "incidents" ("severity")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_incidents_type" ON "incidents" ("type")
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_responses" (
        "id" varchar(50) NOT NULL,
        "incidentId" varchar(50) NOT NULL,
        "action" text NOT NULL,
        "performedBy" varchar(100) NOT NULL,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "result" varchar(20) NOT NULL,
        "details" text,
        CONSTRAINT "PK_incident_responses" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "security_alerts" (
        "id" varchar(50) NOT NULL,
        "event" varchar(50) NOT NULL,
        "severity" "incident_severity_enum" NOT NULL,
        "message" text NOT NULL,
        "userId" uuid,
        "ipAddress" varchar(45),
        "metadata" jsonb,
        "triggeredAt" TIMESTAMP NOT NULL DEFAULT now(),
        "acknowledgedAt" TIMESTAMP,
        "acknowledgedBy" varchar(100),
        "resolvedAt" TIMESTAMP,
        CONSTRAINT "PK_security_alerts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_security_alerts_severity" ON "security_alerts" ("severity")
    `);

    await queryRunner.query(`
      CREATE TABLE "shard_security_policies" (
        "id" varchar(50) NOT NULL,
        "shardId" varchar(50) NOT NULL,
        "shardType" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "enabled" boolean NOT NULL DEFAULT true,
        "accessControl" jsonb NOT NULL,
        "rateLimiting" jsonb NOT NULL,
        "encryption" jsonb NOT NULL,
        "auditLogging" jsonb NOT NULL,
        "quarantineThreshold" jsonb NOT NULL,
        CONSTRAINT "PK_shard_security_policies" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shard_policies_shardId" ON "shard_security_policies" ("shardId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shard_security_policies"`);
    await queryRunner.query(`DROP TABLE "security_alerts"`);
    await queryRunner.query(`DROP TABLE "incident_responses"`);
    await queryRunner.query(`DROP TABLE "incidents"`);
    await queryRunner.query(`DROP TYPE "incident_status_enum"`);
    await queryRunner.query(`DROP TYPE "incident_severity_enum"`);
    await queryRunner.query(`DROP TYPE "incident_type_enum"`);
  }
}
