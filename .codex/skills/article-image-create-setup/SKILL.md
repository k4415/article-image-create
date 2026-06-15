---
name: article-image-create-setup
description: Use when setting up, installing, running, or onboarding the Article LP Asset DB / Image Generation Editor repository, especially when the user says "セットアップして", "setup", "run this project", or asks how to configure Supabase/OpenAI for this folder.
---

# Article Image Create Setup

Use this skill from the repository root. It is written for AI agents helping a user who downloaded this folder and asked to set it up.

## Identify The Repo

Confirm the current folder contains:

- `package.json`
- `.env.local.example`
- `supabase/migrations/`
- `README.md`

If any are missing, ask the user to move to the repository root before continuing.

## Explain Briefly

This is a Next.js 16 app for article LP asset ingestion, semantic image search, and `gpt-image-2` image generation. It needs a Supabase project and an OpenAI API key.

## Setup Workflow

1. Check prerequisites:

```bash
node --version
corepack --version
pnpm --version
```

If `pnpm` is unavailable, run:

```bash
corepack enable
```

2. Install dependencies and create the local env file:

```bash
pnpm setup
```

If you are only giving instructions and not executing commands, tell the user to run this command.

3. Tell the user to edit `.env.local`.

Never print `.env.local` contents. Never ask the user to paste secrets into chat.

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Recommended for shared deployments:

- `APP_BASIC_AUTH_USER`
- `APP_BASIC_AUTH_PASSWORD`

4. Link Supabase and apply migrations:

```bash
pnpm dlx supabase@2.106.0 link --project-ref <project-ref>
pnpm setup:db
```

5. Start the app:

```bash
pnpm dev
```

Report the actual localhost URL shown by Next.js.

6. Verify the repository:

```bash
pnpm check
```

## Security Checks

Before GitHub sharing or deployment, run:

```bash
git check-ignore -v .env.local
git status --short --ignored
```

Confirm `.env.local`, `.next/`, `node_modules/`, and `supabase/.temp/` are ignored.

For any deployed or shared URL, require Basic Auth or an external access layer such as SSO, VPN, Vercel Authentication, or Cloudflare Access.

Do not expose these values in browser code, commits, screenshots, logs, or chat:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `APP_BASIC_AUTH_PASSWORD`

## Troubleshooting

- Missing env vars: fill `.env.local`.
- Supabase schema errors: rerun `pnpm setup:db`.
- Supabase link errors: rerun `pnpm dlx supabase@2.106.0 link --project-ref <project-ref>`.
- Port 3000 already in use: use the port Next.js reports.
- OpenAI image failures: check `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, billing access, and model access.

## Final Response

End the setup response with:

- checks or commands completed
- env values the user still needs to fill, without printing secrets
- the next command to run
- the local URL if the dev server is running
