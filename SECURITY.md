# Security Review

## Summary

This repository is safe to share as source code as long as real environment files are not committed and deployed instances are access-controlled.

The app is an internal operations tool. It is not designed as a public anonymous SaaS product.

## Secrets

Required secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

These values must only exist in local or deployment environment variables. They must not be committed to GitHub.

Current safeguards:

- `.env*` files are ignored by Git.
- `.env.local.example` is explicitly allowed so setup instructions can be shared without secrets.
- Server APIs read secrets only from environment variables.

## Access Control

Risk:

- API routes use Supabase service-role access and can trigger paid OpenAI operations.
- Without authentication, a public deployment would allow unauthorized users to ingest URLs, edit metadata, create projects, search DB records, and start image generation jobs.

Mitigation included in this repo:

- `proxy.ts` enables HTTP Basic Auth when both variables are set:
  - `APP_BASIC_AUTH_USER`
  - `APP_BASIC_AUTH_PASSWORD`
- The proxy protects pages and API routes while excluding Next.js static assets.

Recommended production settings:

```bash
APP_BASIC_AUTH_USER=<shared-user>
APP_BASIC_AUTH_PASSWORD=<long-random-password>
```

For larger teams, prefer SSO, VPN, Vercel Authentication, Cloudflare Access, or another identity-aware access layer.

## Data Handling

The system stores:

- source article URLs
- extracted media assets
- AI-generated annotations and OCR text
- article draft text pasted into editor projects
- generated image prompts and outputs

Before sharing an actual running instance with external parties, confirm that the Supabase project does not contain client-confidential article drafts, source URLs, images, prompts, or generated outputs.

## Known Limitations

- No per-user authorization or team-level permissions are implemented.
- No audit log beyond existing ingest/generation job history.
- No per-user rate limiting. Access control should happen before the app.
- Basic Auth is a simple shared gate, not a replacement for organization-grade identity management.

## Pre-Publish Checklist

- Confirm `.env.local` is ignored and not staged.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` do not appear in tracked files.
- Set Basic Auth or deploy behind SSO/VPN before sharing a live URL.
- Run `pnpm check`.
- Review Supabase data before giving third parties access to a live database.
