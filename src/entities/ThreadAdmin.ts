import { Field, ID, ObjectType } from "type-graphql";
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  DeleteDateColumn,
  Unique,
} from "typeorm";
import { User } from "./User";
import { Thread } from "./Thread";

@ObjectType()
@Entity()
@Unique(["user", "thread"])
export class ThreadAdmin {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Field(() => User)
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user!: User;

  @Field(() => Thread)
  @ManyToOne(() => Thread, { onDelete: "CASCADE" })
  thread!: Thread;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  grantedBy!: User | null;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field({ nullable: true })
  @DeleteDateColumn()
  revokedAt?: Date | null;
}
