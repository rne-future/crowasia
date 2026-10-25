import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/shared/config/env";
import * as schema from "./schema";

declare global {
  var __db_client: postgres.Sql | undefined;
}

const client =
  globalThis.__db_client ??
  postgres(env.DATABASE_URL, {
    max: env.APP_ENV === "production" ? 10 : 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__db_client = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
