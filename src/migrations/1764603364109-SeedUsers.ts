import { MigrationInterface, QueryRunner } from "typeorm";
import bcrypt from "bcrypt";

export class SeedUsers1670000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Pre-hash passwords
        const password1 = await bcrypt.hash("Password123!", 10);
        const password2 = await bcrypt.hash("Secret456!", 10);

        await queryRunner.query(`
            INSERT INTO "user" 
            (id, "userName", "firstName", "lastName", email, password, bio, ideology, "profilePicUrl") 
            VALUES 
            (
                '11111111-1111-1111-1111-111111111111', 
                'jdoe', 
                'John', 
                'Doe', 
                'jdoe@example.com', 
                '${password1}', 
                'Full-stack developer and coffee enthusiast.', 
                'Progressive', 
                'https://example.com/profiles/jdoe.png'
            ),
            (
                '22222222-2222-2222-2222-222222222222', 
                'asmith', 
                'Alice', 
                'Smith', 
                'asmith@example.com', 
                '${password2}', 
                'Front-end engineer and avid reader.', 
                'Libertarian', 
                'https://example.com/profiles/asmith.png'
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DELETE FROM "user" WHERE "userName" IN ('jdoe', 'asmith');
        `);
    }
}
