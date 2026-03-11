import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ObjectType, Field, ID } from 'type-graphql';

export enum NewsType {
  ARTICLE = 'article',
  VIDEO = 'video',
}

export enum NewsSourceType {
  RSS = 'rss',
  YOUTUBE = 'youtube',
}

@ObjectType()
@Entity('news_articles')
@Index(['sourceName', 'publishedAt'])
@Index(['newsType'])
export class NewsArticle {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  content?: string;

  @Field()
  @Column({ type: 'varchar', length: 1000 })
  url!: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Field(() => NewsType)
  @Column({
    type: 'enum',
    enum: NewsType,
    default: NewsType.ARTICLE,
  })
  newsType!: NewsType;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  sourceName!: string;

  @Field(() => NewsSourceType)
  @Column({
    type: 'enum',
    enum: NewsSourceType,
    default: NewsSourceType.RSS,
  })
  sourceType!: NewsSourceType;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  author?: string;

  @Field()
  @Column({ type: 'timestamp' })
  publishedAt!: Date;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  aiSummary?: string;

  @Field({ nullable: true })
  @Column({ type: 'int', nullable: true })
  duration?: number; // For videos, in seconds

  @Field()
  @CreateDateColumn()
  createdAt!: Date;
}
