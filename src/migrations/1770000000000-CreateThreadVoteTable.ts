import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateThreadVoteTable1770000000000 implements MigrationInterface {
  name = 'CreateThreadVoteTable1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "thread_vote" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "perspective" VARCHAR NOT NULL DEFAULT 'NEUTRAL',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "threadId" uuid NOT NULL,
        CONSTRAINT "thread_vote_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "thread_vote_user_thread_unique" UNIQUE ("userId", "threadId")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "thread_vote" 
      ADD CONSTRAINT "thread_vote_user_fk" 
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "thread_vote" 
      ADD CONSTRAINT "thread_vote_thread_fk" 
      FOREIGN KEY ("threadId") REFERENCES "thread"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "thread_vote"`);
  }
}
