import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePostsAndThreads1670000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "thread" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" uuid,
        "isLocked" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_c69d28a5fa7dc4dd4dfb35b69" PRIMARY KEY ("id"),
        CONSTRAINT "FK_c69d28a5fa7dc4dd4dfb35b69b" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "post" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "content" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "authorId" uuid NOT NULL,
        "threadId" uuid NOT NULL,
        "parentId" uuid,
        "postType" character varying NOT NULL DEFAULT 'comment',
        "isPinned" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_a6c6e8b8e7c4c8d8b43b8bc" PRIMARY KEY ("id"),
        CONSTRAINT "FK_a6c6e8b8e7c4c8d8b43b8bc5" FOREIGN KEY ("authorId") REFERENCES "user" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_a6c6e8b8e7c4c8d8b43b8bc8" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_a6c6e8b8e7c4c8d8b43b8bc9" FOREIGN KEY ("parentId") REFERENCES "post" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "thread_admin" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "threadId" uuid NOT NULL,
        CONSTRAINT "PK_f8c06b9b9b4f4c8d8b43b8bd" PRIMARY KEY ("id"),
        CONSTRAINT "FK_f8c06b9b9b4f4c8d8b43b8bd4" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_f8c06b9b9b4f4c8d8b43b8bd5" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_c69d28a5fa7dc4dd4dfb35b69b" ON "thread" ("createdById")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6c6e8b8e7c4c8d8b43b8bc5" ON "post" ("authorId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6c6e8b8e7c4c8d8b43b8bc8" ON "post" ("threadId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6c6e8b8e7c4c8d8b43b8bc9" ON "post" ("parentId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8c06b9b9b4f4c8d8b43b8bd4" ON "thread_admin" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8c06b9b9b4f4c8d8b43b8bd5" ON "thread_admin" ("threadId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "thread_admin"`);
    await queryRunner.query(`DROP TABLE "post"`);
    await queryRunner.query(`DROP TABLE "thread"`);
  }
}
