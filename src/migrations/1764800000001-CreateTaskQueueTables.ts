import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTaskQueueTables1764800000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "task_status_enum" AS ENUM (
        'PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "task_priority_enum" AS ENUM (
        'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'IDLE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "taskType" varchar(100) NOT NULL,
        "status" "task_status_enum" NOT NULL DEFAULT 'PENDING',
        "priority" "task_priority_enum" NOT NULL DEFAULT 'NORMAL',
        "payload" text,
        "result" text,
        "provider" varchar(50),
        "workerId" varchar(100),
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "retryCount" integer NOT NULL DEFAULT 0,
        "maxRetries" integer NOT NULL DEFAULT 3,
        "errorMessage" text,
        "errorStack" varchar(500),
        "timeout" integer NOT NULL DEFAULT 300000,
        "scheduledAt" TIMESTAMP,
        "requestId" varchar(100),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tasks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "task_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "taskId" uuid NOT NULL,
        "eventType" varchar(50) NOT NULL,
        "metadata" text,
        "workerId" varchar(100),
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_task_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "task_metrics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "queueName" varchar(100) NOT NULL,
        "waitingCount" integer NOT NULL DEFAULT 0,
        "activeCount" integer NOT NULL DEFAULT 0,
        "completedCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0,
        "averageProcessingTimeMs" float NOT NULL DEFAULT 0,
        "throughput" float NOT NULL DEFAULT 0,
        "recordedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_task_metrics" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "workers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workerId" varchar(100) NOT NULL UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'IDLE',
        "currentTaskId" uuid,
        "currentQueue" varchar(100),
        "tasksProcessed" integer NOT NULL DEFAULT 0,
        "tasksFailed" integer NOT NULL DEFAULT 0,
        "averageProcessingTimeMs" float NOT NULL DEFAULT 0,
        "cpuUsage" float NOT NULL DEFAULT 0,
        "memoryUsage" float NOT NULL DEFAULT 0,
        "lastHeartbeatAt" TIMESTAMP NOT NULL DEFAULT now(),
        "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workers_task" FOREIGN KEY ("currentTaskId") REFERENCES "tasks" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_user_status" ON "tasks" ("userId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_worker_status" ON "tasks" ("workerId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_created" ON "tasks" ("createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_task_events_task_timestamp" ON "task_events" ("taskId", "timestamp")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workers_heartbeat" ON "workers" ("lastHeartbeatAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workers_status" ON "workers" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "workers"`);
    await queryRunner.query(`DROP TABLE "task_metrics"`);
    await queryRunner.query(`DROP TABLE "task_events"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TYPE "task_priority_enum"`);
    await queryRunner.query(`DROP TYPE "task_status_enum"`);
  }
}
