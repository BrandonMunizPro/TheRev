import "dotenv/config";
import "reflect-metadata";
import express from "express";
import { createYoga } from "graphql-yoga";
import { AppDataSource } from "./data-source";
import { buildSchema } from "type-graphql";
import { UserResolver } from "./resolvers/User";

const app = express();
const PORT = 4000;

async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("📡 NEXUS database connected");

    // Build GraphQL schema using TypeGraphQL
    const schema = await buildSchema({
      resolvers: [UserResolver],
      validate: false,
    });

    // Create Yoga GraphQL server
    const yoga = createYoga({
      schema,
      graphqlEndpoint: "/graphql", // default
    });

    // Attach Yoga to Express
    app.use("/graphql", yoga);

    // JSON support
    app.use(express.json());

    app.listen(PORT, () => {
      console.log(`🧠 NEXUS core listening on http://localhost:${PORT}`);
      console.log(`🚀 GraphQL ready at http://localhost:${PORT}/graphql`);
    });
  } catch (error) {
    console.error("DB init error:", error);
  }
}

startServer();
