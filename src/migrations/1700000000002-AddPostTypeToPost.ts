import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostTypeToPost1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "postType" character varying NOT NULL DEFAULT 'comment'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "postType"`);
  }
}
