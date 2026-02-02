import "dotenv/config";
import "reflect-metadata";
import express from "express";
import { getUserFromRequest } from "./auth/getUserFromRequest";
import { createYoga } from "graphql-yoga";
import { AppDataSource } from "./data-source";
import { buildSchema } from "type-graphql";
import { UserResolver } from "./resolvers/User";
import { ThreadResolver } from "./resolvers/Thread";
import { AuthResolver } from "./resolvers/Auth";
import { PostResolver } from "./resolvers/Post";
import { ThreadAdminResolver } from "./resolvers/ThreadPermissions";
import { GraphQLContext } from "./graphql/context";

const app = express();
const PORT = 4000;

async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("📡 NEXUS database connected");

const schema = await buildSchema({
      resolvers: [AuthResolver, UserResolver, ThreadResolver, ThreadAdminResolver, PostResolver],
      validate: false,
    });

    const yoga = createYoga<GraphQLContext>({
      schema,
      graphqlEndpoint: "/graphql",
      context: ({ request }) => ({
        user: getUserFromRequest(request),
      }),
    });

    app.use(express.json());
    app.use("/graphql", yoga as any); 

    app.listen(PORT, () => {
      console.log(`🧠 NEXUS core listening on http://localhost:${PORT}`);
      console.log(`🚀 GraphQL ready at http://localhost:${PORT}/graphql`);
    });
  } catch (error) {
    console.error("DB init error:", error);
  }
}

startServer();
