import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entities/User";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "Bjornmaximus11",
  database: "postgres",
  synchronize: false, // use false if you want migrations
  logging: true,
  entities: [User],
  migrations: ["./src/migrations/*.ts"],
  subscribers: [],
});
