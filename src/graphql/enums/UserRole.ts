import { registerEnumType } from "type-graphql";

export enum UserRole {
  STANDARD = "STANDARD",
  ADMIN = "ADMIN",
  THREAD_ADMIN = "THREAD_ADMIN",
}

registerEnumType(UserRole, {
  name: "UserRole",
  description: "User roles for authorization",
});
