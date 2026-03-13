import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const environmentSchema = z.object({
  // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
  DASH_API_BASE_URL: z.string().min(1, 'DASH_API_BASE_URL must not be empty'),
  // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
  DASH_API_AGENCY: z.string().min(1, 'DASH_API_AGENCY must not be empty'),
  // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
  DASH_API_KEY: z.string().min(1, 'DASH_API_KEY must not be empty'),
  // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue: z.ZodIssue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const environment = {
  dashApi: {
    baseUrl: parsed.data.DASH_API_BASE_URL,
    agency: parsed.data.DASH_API_AGENCY,
    apiKey: parsed.data.DASH_API_KEY,
  },
  server: {
    port: parsed.data.PORT,
  },
};
