import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from 'type-graphql';

export enum TaskStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum TaskPriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  IDLE = 4,
}

export enum TaskType {
  AUTOMATION = 'AUTOMATION',
  GENERATION = 'GENERATION',
  ANALYSIS = 'ANALYSIS',
}

@ObjectType()
@Entity('tasks')
@Index(['userId', 'status'])
@Index(['workerId', 'status'])
@Index(['createdAt'])
export class TaskEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column('uuid')
  userId!: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  taskType!: string;

  @Field(() => TaskStatus)
  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status!: TaskStatus;

  @Field(() => TaskPriority)
  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.NORMAL,
  })
  priority!: TaskPriority;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  payload?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  result?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  provider?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  workerId?: string;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3 })
  maxRetries!: number;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  errorStack?: string;

  @Field()
  @Column({ type: 'int', default: 300000 })
  timeout!: number;

  @Field({ nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  requestId?: string;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}

@ObjectType()
@Entity('task_events')
@Index(['taskId', 'timestamp'])
export class TaskEvent {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column('uuid')
  taskId!: string;

  @Field()
  @Column({ type: 'varchar', length: 50 })
  eventType!: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  metadata?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  workerId?: string;

  @Field()
  @CreateDateColumn()
  timestamp!: Date;
}

@ObjectType()
@Entity('task_metrics')
export class TaskMetrics {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  queueName!: string;

  @Field()
  @Column({ type: 'int', default: 0 })
  waitingCount!: number;

  @Field()
  @Column({ type: 'int', default: 0 })
  activeCount!: number;

  @Field()
  @Column({ type: 'int', default: 0 })
  completedCount!: number;

  @Field()
  @Column({ type: 'int', default: 0 })
  failedCount!: number;

  @Field()
  @Column({ type: 'float', default: 0 })
  averageProcessingTimeMs!: number;

  @Field()
  @Column({ type: 'float', default: 0 })
  throughput!: number;

  @Field()
  @CreateDateColumn()
  recordedAt!: Date;
}

export enum WorkerStatus {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

@ObjectType()
@Entity('workers')
@Index(['status'])
@Index(['lastHeartbeatAt'])
export class Worker {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 100, unique: true })
  workerId!: string;

  @Field(() => WorkerStatus)
  @Column({
    type: 'enum',
    enum: WorkerStatus,
    default: WorkerStatus.IDLE,
  })
  status!: WorkerStatus;

  @Field({ nullable: true })
  @Column({ type: 'uuid', nullable: true })
  currentTaskId?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  currentQueue?: string;

  @Field()
  @Column({ type: 'int', default: 0 })
  tasksProcessed!: number;

  @Field()
  @Column({ type: 'int', default: 0 })
  tasksFailed!: number;

  @Field()
  @Column({ type: 'float', default: 0 })
  averageProcessingTimeMs!: number;

  @Field()
  @Column({ type: 'float', default: 0 })
  cpuUsage!: number;

  @Field()
  @Column({ type: 'float', default: 0 })
  memoryUsage!: number;

  @Field()
  @Column({ type: 'int', default: 1 })
  maxConcurrentTasks!: number;

  @Field()
  @Column({ type: 'timestamp' })
  lastHeartbeatAt!: Date;

  @Field()
  @Column({ type: 'timestamp' })
  startedAt!: Date;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;
}
