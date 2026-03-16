import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataToPost1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post" ADD COLUMN IF NOT EXISTS metadata jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post" DROP COLUMN IF EXISTS metadata
    `);
  }
}
