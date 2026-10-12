import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Channel } from './Channel';

@Entity('channel_read_state')
export class ChannelReadState {
  @PrimaryColumn('uuid', { name: 'user_id' }) userId!: string;
  @PrimaryColumn('uuid', { name: 'channel_id' }) channelId!: string;
  // Store exact database timestamp precision; keep the marker when a message is deleted.
  @Column('timestamp', { name: 'read_at' }) readAt!: Date;
  @Column('uuid', { name: 'message_id' }) messageId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel!: Channel;
}
