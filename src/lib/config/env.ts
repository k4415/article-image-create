import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_VISION_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_PROMPT_MODEL: z.string().optional(),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  LP_ASSET_BUCKET: z.string().default("lp-assets"),
  IMAGE_GENERATION_CONCURRENCY: z.coerce.number().int().positive().max(4).default(2),
  IMAGE_GENERATION_BATCH_LIMIT: z.coerce.number().int().positive().max(50).default(10),
});

export type AppEnv = z.infer<typeof envSchema>;

export function getServerEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }
  return parsed.data;
}

export function getOptionalPublicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}
