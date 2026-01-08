import { registerEnumType } from "type-graphql";

export enum PostType {
  TEXT = "TEXT",
  VIDEO = "VIDEO",
  IMAGE = "IMAGE",
}

registerEnumType(PostType, {
  name: "PostType",
  description: "Type of content a post contains",
});
