import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedThreadsAndPosts1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create 5 threads with various post types
    const threads = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        title: 'Welcome to TheRev - Introduce Yourself!',
        content: 'This is the official welcome thread. Tell us about yourself!',
        authorId: '11111111-1111-1111-1111-111111111111',
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        title: 'Breaking: Major Political News Discussion',
        content: 'Discuss the latest political developments here.',
        authorId: '22222222-2222-2222-2222-222222222222',
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        title: 'Video: Analysis of Current Events',
        content: 'Sharing a video analysis of recent events.',
        authorId: '11111111-1111-1111-1111-111111111111',
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        title: 'Photo Gallery: Political Rallies',
        content: 'Photos from recent political rallies across the country.',
        authorId: '22222222-2222-2222-2222-222222222222',
      },
      {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        title: 'Debate: Best Path Forward for Progressives',
        content: "Let's discuss strategy for progressive causes.",
        authorId: '11111111-1111-1111-1111-111111111111',
      },
    ];

    // Insert threads
    for (const thread of threads) {
      await queryRunner.query(
        `
        INSERT INTO "thread" (id, title, content, "authorId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `,
        [thread.id, thread.title, thread.content, thread.authorId]
      );
    }

    // Create posts for each thread
    const posts = [
      // Thread 1: Welcome thread posts
      {
        threadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'TEXT',
        content: 'Welcome everyone! This is a great community.',
      },
      {
        threadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        authorId: '22222222-2222-2222-2222-222222222222',
        type: 'TEXT',
        content: 'Excited to be here! Looking forward to the discussions.',
      },
      {
        threadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'TEXT',
        content: "First post! Can't wait to engage with everyone.",
      },

      // Thread 2: Political news discussion
      {
        threadId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        authorId: '22222222-2222-2222-2222-222222222222',
        type: 'TEXT',
        content: 'What do everyone think about the latest policy proposals?',
      },
      {
        threadId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'TEXT',
        content: 'I think we need to focus on economic reform first.',
      },

      // Thread 3: Video post
      {
        threadId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'VIDEO',
        content:
          'Check out this analysis video on the current state of politics.',
        metadata: {
          thumbnailUrl: 'https://example.com/thumbnails/video1.jpg',
          duration: 1245,
          provider: 'youtube',
        },
      },
      {
        threadId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        authorId: '22222222-2222-2222-2222-222222222222',
        type: 'TEXT',
        content: 'Great video! Very informative.',
      },

      // Thread 4: Image gallery
      {
        threadId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        authorId: '22222222-2222-2222-2222-222222222222',
        type: 'IMAGE',
        content: 'Photos from the downtown rally yesterday.',
        metadata: {
          thumbnailUrl: 'https://example.com/thumbnails/rally1.jpg',
        },
      },
      {
        threadId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'IMAGE',
        content: 'More photos from the march.',
        metadata: {
          thumbnailUrl: 'https://example.com/thumbnails/rally2.jpg',
        },
      },

      // Thread 5: Debate
      {
        threadId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'TEXT',
        content:
          'We need to unite around core issues. What are your priorities?',
      },
      {
        threadId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        authorId: '22222222-2222-2222-2222-222222222222',
        type: 'TEXT',
        content: 'Healthcare and education are my top priorities.',
      },
      {
        threadId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        authorId: '11111111-1111-1111-1111-111111111111',
        type: 'TEXT',
        content:
          "Agreed. Can't have a functioning democracy without educated citizens.",
      },
      {
        threadId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        authorId: '22222222-2222-2222-2222-222222222222',
        type: 'TEXT',
        content: "Let's organize around these issues.",
      },
    ];

    // Insert posts
    for (const post of posts) {
      await queryRunner.query(
        `
        INSERT INTO "post" (id, "threadId", "authorId", type, content, metadata, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
      `,
        [
          post.threadId,
          post.authorId,
          post.type,
          post.content,
          post.metadata ? JSON.stringify(post.metadata) : null,
        ]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "post"`);
    await queryRunner.query(`DELETE FROM "thread"`);
  }
}
