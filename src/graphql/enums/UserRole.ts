import { registerEnumType } from 'type-graphql';

export enum UserRole {
  // STANDARD = "STANDARD", // Currently unused
  // ADMIN = "ADMIN", // Currently unused
  // THREAD_ADMIN = "THREAD_ADMIN", // Currently unused
}

registerEnumType(UserRole, {
  name: 'UserRole',
  description: 'User roles for authorization',
});
