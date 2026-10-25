export interface Env {
  APP_ENV: "development" | "staging" | "production";
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DATABASE_URL: string;
  CRON_SECRET?: string;
  MAYAR_API_KEY?: string;
  MAYAR_BASE_URL?: string;
  MAYAR_WEBHOOK_TOKEN?: string;
}

const rawEnv = {
  APP_ENV: (process.env.APP_ENV as Env["APP_ENV"]) || "development",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  MAYAR_API_KEY: process.env.MAYAR_API_KEY,
  MAYAR_BASE_URL: process.env.MAYAR_BASE_URL,
  MAYAR_WEBHOOK_TOKEN: process.env.MAYAR_WEBHOOK_TOKEN,
};

const required: (keyof Pick<Env, "SUPABASE_URL" | "SUPABASE_ANON_KEY" | "DATABASE_URL">)[] = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
];

function validateEnv(): Env {
  const missing = required.filter((key) => !rawEnv[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return {
    APP_ENV: rawEnv.APP_ENV,
    SUPABASE_URL: rawEnv.SUPABASE_URL!,
    SUPABASE_ANON_KEY: rawEnv.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: rawEnv.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: rawEnv.DATABASE_URL!,
    CRON_SECRET: rawEnv.CRON_SECRET,
    MAYAR_API_KEY: rawEnv.MAYAR_API_KEY,
    MAYAR_BASE_URL: rawEnv.MAYAR_BASE_URL,
    MAYAR_WEBHOOK_TOKEN: rawEnv.MAYAR_WEBHOOK_TOKEN,
  };
}

const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

// Only validate on server at runtime, not during build or tests
export const env: Env =
  typeof window === "undefined" && process.env.NODE_ENV !== "test" && !isBuildTime
    ? validateEnv()
    : {
        APP_ENV: rawEnv.APP_ENV,
        SUPABASE_URL: rawEnv.SUPABASE_URL || "http://localhost:54321",
        SUPABASE_ANON_KEY: rawEnv.SUPABASE_ANON_KEY || "mock-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: rawEnv.SUPABASE_SERVICE_ROLE_KEY,
        DATABASE_URL: rawEnv.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/crowasia",
        CRON_SECRET: process.env.CRON_SECRET,
        MAYAR_API_KEY: process.env.MAYAR_API_KEY,
        MAYAR_BASE_URL: process.env.MAYAR_BASE_URL,
        MAYAR_WEBHOOK_TOKEN: process.env.MAYAR_WEBHOOK_TOKEN,
      };
