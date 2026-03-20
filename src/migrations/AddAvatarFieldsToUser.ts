import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarFieldsToUser1774000000000 implements MigrationInterface {
  name = 'AddAvatarFieldsToUser1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "avatarUrl" character varying`
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "avatarConfig" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatarUrl"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatarConfig"`);
  }
}
