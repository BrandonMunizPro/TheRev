import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerspectiveToPost1700000000004 implements MigrationInterface {
  name = 'AddPerspectiveToPost1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post" 
      ADD COLUMN IF NOT EXISTS "perspective" VARCHAR DEFAULT 'NEUTRAL'
    `);

    // Add check constraint for valid perspectives
    await queryRunner.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'post_perspective_check'
        ) THEN
          ALTER TABLE "post" 
          ADD CONSTRAINT "post_perspective_check" 
          CHECK ("perspective" IN ('PRO', 'AGAINST', 'NEUTRAL'));
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "post" DROP COLUMN IF EXISTS "perspective"
    `);
  }
}
