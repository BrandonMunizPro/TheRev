import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParentIdToPost1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "parentId" uuid REFERENCES "post"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_post_parentId" ON "post" ("parentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_post_parentId"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "parentId"`);
  }
}
