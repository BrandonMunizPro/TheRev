import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationTable1780000000000 implements MigrationInterface {
  name = 'CreateNotificationTable1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_type_enum" AS ENUM (
        'MESSAGE', 
        'THREAD_REPLY', 
        'FRIEND_REQUEST', 
        'FRIEND_ACCEPTED', 
        'THREAD_MENTION', 
        'POST_UPVOTE', 
        'SERVER_INVITE', 
        'CHANNEL_MESSAGE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notification_status_enum" AS ENUM ('UNREAD', 'READ', 'DISMISSED')
    `);

    await queryRunner.query(`
      CREATE TABLE "notification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "notification_type_enum" NOT NULL DEFAULT 'MESSAGE',
        "title" text NOT NULL,
        "message" text NOT NULL,
        "status" "notification_status_enum" NOT NULL DEFAULT 'UNREAD',
        "reference_id" uuid,
        "reference_type" character varying,
        "actor_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_user" FOREIGN KEY ("user_id") 
          REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notification_actor" FOREIGN KEY ("actor_id") 
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notification_user" ON "notification" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notification_status" ON "notification" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notification_created" ON "notification" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notification_user_status" ON "notification" ("user_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_notification_user_status"`);
    await queryRunner.query(`DROP INDEX "idx_notification_created"`);
    await queryRunner.query(`DROP INDEX "idx_notification_status"`);
    await queryRunner.query(`DROP INDEX "idx_notification_user"`);
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TYPE "notification_status_enum"`);
    await queryRunner.query(`DROP TYPE "notification_type_enum"`);
  }
}
