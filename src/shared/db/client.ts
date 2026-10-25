import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/shared/config/env";
import * as schema from "./schema";

declare global {
  var __db_client: postgres.Sql | undefined;
}

function getPostgresConnection(rawUrl: string): postgres.Options<{}> | string {
  if (
    rawUrl.startsWith("socket://") ||
    rawUrl.includes("host=/var/run/postgresql") ||
    rawUrl.includes("%2Fvar%2Frun%2Fpostgresql")
  ) {
    try {
      const url = new URL(
        rawUrl.replace("socket://", "postgres://dummy@localhost/")
      );
      return {
        host: url.searchParams.get("host") || "/var/run/postgresql",
        user: (url.username !== "dummy" ? url.username : "") || process.env.USER || "harry",
        database: url.pathname.replace(/^\/+/, "") || "crowasia",
      };
    } catch {
      // Fallback to raw string if URL parsing fails
    }
  }
  return rawUrl;
}

const client =
  globalThis.__db_client ??
  postgres(getPostgresConnection(env.DATABASE_URL) as string, {
    max: env.APP_ENV === "production" ? 10 : 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__db_client = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
