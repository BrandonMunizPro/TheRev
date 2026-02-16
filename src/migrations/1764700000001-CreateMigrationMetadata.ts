import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMigrationMetadataTables1764700000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "migration_state" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "migrationId" varchar NOT NULL UNIQUE,
        "status" varchar NOT NULL DEFAULT 'pending',
        "totalUsers" integer NOT NULL DEFAULT 0,
        "processedUsers" integer NOT NULL DEFAULT 0,
        "failedUsers" integer NOT NULL DEFAULT 0,
        "shardCount" integer NOT NULL DEFAULT 0,
        "chunkSize" integer NOT NULL DEFAULT 100,
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_migration_state" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_storage_location" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL UNIQUE,
        "primaryLocation" varchar NOT NULL DEFAULT 'legacy',
        "shardId" integer,
        "dualWriteEnabled" boolean NOT NULL DEFAULT false,
        "migratedAt" TIMESTAMP,
        "migratedById" uuid,
        "verificationStatus" varchar DEFAULT 'pending',
        "lastVerifiedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_storage_location" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_storage_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "migration_batch_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "migrationId" varchar NOT NULL,
        "batchNumber" integer NOT NULL,
        "userIds" uuid[] NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "processedAt" TIMESTAMP,
        "errorMessage" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_migration_batch_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_migration_state_status" ON "migration_state" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_storage_userId" ON "user_storage_location" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_storage_primaryLocation" ON "user_storage_location" ("primaryLocation")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_migration_batch_migrationId" ON "migration_batch_log" ("migrationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "migration_batch_log"`);
    await queryRunner.query(`DROP TABLE "user_storage_location"`);
    await queryRunner.query(`DROP TABLE "migration_state"`);
  }
}
