import { registerEnumType } from 'type-graphql';

export enum PostType {
  // TEXT = "TEXT", // Currently unused
  // VIDEO = "VIDEO", // Currently unused
  // IMAGE = "IMAGE", // Currently unused
}

registerEnumType(PostType, {
  name: 'PostType',
  description: 'Type of content a post contains',
});
