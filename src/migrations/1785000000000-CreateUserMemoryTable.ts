import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserMemoryTable1785000000000 implements MigrationInterface {
  name = 'CreateUserMemoryTable1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_memory_type_enum" AS ENUM (
        'fact', 'preference', 'interest', 'relationship', 'goal', 'project'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_memory" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "user_memory_type_enum" NOT NULL,
        "content" text NOT NULL,
        "normalized_key" character varying(255) NOT NULL,
        "search_vector" tsvector,
        "confidence" decimal(3,2) NOT NULL DEFAULT 0.7,
        "importance" integer NOT NULL DEFAULT 5,
        "source" character varying(50) NOT NULL,
        "source_interaction_id" character varying(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_accessed_at" TIMESTAMP,
        "access_count" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_user_memory_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_memory_user" FOREIGN KEY ("user_id")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_memory_user" ON "user_memory" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_memory_user_active" ON "user_memory" ("user_id", "active")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_memory_user_type" ON "user_memory" ("user_id", "type")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_memory_normalized_key" ON "user_memory" ("user_id", "normalized_key")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_memory_search" ON "user_memory" USING GIN ("search_vector")
    `);

    await queryRunner.query(`
      CREATE TRIGGER "user_memory_search_vector_trigger"
      BEFORE INSERT OR UPDATE ON "user_memory"
      FOR EACH ROW EXECUTE FUNCTION
      tsvector_update_trigger("search_vector", 'pg_catalog.english', "content")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "user_memory_search_vector_trigger" ON "user_memory"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_memory_search"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_user_memory_normalized_key"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_memory_user_type"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_user_memory_user_active"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_memory_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_memory"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_memory_type_enum"`);
  }
}
