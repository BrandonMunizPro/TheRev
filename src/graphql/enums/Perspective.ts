import { registerEnumType } from 'type-graphql';

export enum Perspective {
  PRO = 'PRO',
  AGAINST = 'AGAINST',
  NEUTRAL = 'NEUTRAL',
}

registerEnumType(Perspective, {
  name: 'Perspective',
  description: 'User perspective on a thread topic',
});
