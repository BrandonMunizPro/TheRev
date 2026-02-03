import { MigrationInterface, QueryRunner } from 'typeorm';
import bcrypt from 'bcrypt';

export class SeedNewUsers1670000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const password1 = await bcrypt.hash(
      process.env.SEED_USER_PASSWORD || 'NewPass123!',
      10
    );
    const password2 = await bcrypt.hash(
      process.env.SEED_ADMIN_PASSWORD || 'Bjornmaximus11$',
      10
    );

    await queryRunner.query(`
      INSERT INTO "user" 
      (id, "userName", "firstName", "lastName", email, password, bio, ideology, "profilePicUrl") 
      VALUES 
      (
        '33333333-3333-3333-3333-333333333333',
        'bwayne',
        'Bruce',
        'Wayne',
        'bwayne@example.com',
        '${password1}',
        'Dark Knight and philanthropist.',
        'Neutral',
        'https://example.com/profiles/bwayne.png'
      ),
      (
        '44444444-4444-4444-4444-444444444444',
        'BMuniz11',
        'Brandon',
        'Muniz Rosado',
        'brandonmuniz1@gmail.com',
        '${password2}',
        'Architect',
        'Progressive',
        'https://example.com/profiles/ckent.png'
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user" WHERE "userName" IN ('bwayne', 'ckent');
    `);
  }
}
