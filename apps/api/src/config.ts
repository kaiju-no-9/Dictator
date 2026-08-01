import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgres://dictator:dictator@localhost:5432/dictator'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET_RAW: z.string().default('dictator-raw'),
  S3_BUCKET_PROCESSED: z.string().default('dictator-processed'),
  S3_BUCKET_RENDERS: z.string().default('dictator-renders'),
  S3_REGION: z.string().default('us-east-1'),
  AI_SERVICE_URL: z.string().default('http://localhost:8001'),
  API_PORT: z.coerce.number().default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SHOTSTACK_API_KEY: z.string().optional(),
  SHOTSTACK_ENV: z.enum(['stage', 'v1']).default('stage'),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    return envSchema.parse({});
  }
  return result.data;
}

export const config = loadConfig();
