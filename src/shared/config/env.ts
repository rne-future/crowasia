const envSchema = {
  APP_ENV: process.env.APP_ENV as "development" | "staging" | "production" | undefined,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

type EnvKey = keyof typeof envSchema;

const required: EnvKey[] = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "DATABASE_URL"];

function validateEnv() {
  const missing = required.filter((key) => !envSchema[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return envSchema as { [K in EnvKey]: string };
}

// Only validate on server at runtime, not during build
export const env =
  typeof window === "undefined" && process.env.NODE_ENV !== "test"
    ? validateEnv()
    : envSchema;
