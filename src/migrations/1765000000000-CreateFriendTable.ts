import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFriendTable1765000000000 implements MigrationInterface {
  name = 'CreateFriendTable1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "friend_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED')
    `);

    await queryRunner.query(`
      CREATE TABLE "friend" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requester_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "status" "friend_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP,
        CONSTRAINT "PK_friend_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_friend_requester" FOREIGN KEY ("requester_id") 
          REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_friend_recipient" FOREIGN KEY ("recipient_id") 
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_friend_requester" ON "friend" ("requester_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_friend_recipient" ON "friend" ("recipient_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_friend_status" ON "friend" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_friend_status"`);
    await queryRunner.query(`DROP INDEX "idx_friend_recipient"`);
    await queryRunner.query(`DROP INDEX "idx_friend_requester"`);
    await queryRunner.query(`DROP TABLE "friend"`);
    await queryRunner.query(`DROP TYPE "friend_status_enum"`);
  }
}
