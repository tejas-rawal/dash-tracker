import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

// An entry must be exactly what a browser sends in Origin: an http(s) URL that is its own origin. Comparing against
// URL.origin rejects a path, trailing slash, query, fragment, credentials, explicit default port, uppercase host,
// `*` and `null`, so a typo fails startup instead of silently never matching (Phase 18 D-15).
function isExactOrigin(entry: string): boolean {
    let url: URL;
    try {
        url = new URL(entry);
    } catch {
        return false;
    }
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === entry;
}

const environmentSchema = z.object({
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DASH_API_BASE_URL: z.string().min(1, "DASH_API_BASE_URL must not be empty"),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DASH_API_AGENCY: z.string().min(1, "DASH_API_AGENCY must not be empty"),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DASH_API_KEY: z.string().min(1, "DASH_API_KEY must not be empty"),
    // Capped at Node's max timer delay: a larger value overflows AbortSignal.timeout, which then
    // aborts every DASH call after 1ms or throws, instead of failing startup here.
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DASH_API_TIMEOUT_MS: z.coerce.number().int().positive().max(2_147_483_647).default(10000),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    PORT: z.coerce.number().int().positive().default(3000),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DB_PATH: z.string().min(1).default("data/dash-tracker.sqlite"),
    // Number of trusted reverse proxies in front of the server. 0 ignores X-Forwarded-For, so the rate limit keys
    // on the socket address and a forged header cannot dodge it. Digits only: coercion would turn an empty value
    // into 0 instead of failing startup (D-17).
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    TRUST_PROXY_HOPS: z
        .string()
        .regex(/^\d+$/, "TRUST_PROXY_HOPS must be a non-negative integer")
        .default("0")
        .transform(Number),
    // Comma-separated browser origins allowed to read API responses. The empty default means no browser origin may;
    // that is not a fallback, because native apps and curl send no Origin and are unaffected (Phase 18 D-15).
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    CORS_ALLOWED_ORIGINS: z
        .string()
        .default("")
        .transform((value: string): string[] =>
            value
                .split(",")
                .map((entry: string): string => entry.trim())
                .filter((entry: string): boolean => entry.length > 0),
        )
        .pipe(
            z.array(
                z.string().refine(isExactOrigin, (entry: string): { message: string } => ({
                    message: `entry '${entry}' must be an exact http(s) origin such as http://localhost:8081 (no path, trailing slash, query, credentials or *)`,
                })),
            ),
        ),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
    const issues = parsed.error.issues
        .map((issue: z.ZodIssue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const environment = {
    dashApi: {
        baseUrl: parsed.data.DASH_API_BASE_URL,
        agency: parsed.data.DASH_API_AGENCY,
        apiKey: parsed.data.DASH_API_KEY,
        timeoutMs: parsed.data.DASH_API_TIMEOUT_MS,
    },
    server: {
        port: parsed.data.PORT,
        trustProxyHops: parsed.data.TRUST_PROXY_HOPS,
    },
    database: {
        path: parsed.data.DB_PATH,
    },
    cors: {
        allowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS,
    },
};
