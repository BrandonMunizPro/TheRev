import { registerEnumType } from 'type-graphql';

export enum FriendStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  BLOCKED = 'BLOCKED',
}

registerEnumType(FriendStatus, {
  name: 'FriendStatus',
  description: 'Status of a friend relationship',
});
