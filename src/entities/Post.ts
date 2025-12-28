import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import { User } from "./User";
import { Thread } from "./Thread";

@Entity()
export class Post {

  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  content!: string;

  @ManyToOne(() => User, (user) => user.posts, { onDelete: "CASCADE" })
  author!: User;

  @ManyToOne(() => Thread, (thread) => thread.posts, { onDelete: "CASCADE" })
  thread!: Thread;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
  
}
