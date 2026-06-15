#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing dependencies"
pnpm install

if [ ! -f ".env.local" ]; then
  echo "==> Creating .env.local from .env.local.example"
  cp ".env.local.example" ".env.local"
else
  echo "==> .env.local already exists; leaving it unchanged"
fi

cat <<'EOF'

Setup files are ready.

Next steps:
1. Edit .env.local and fill Supabase / OpenAI values.
2. Link Supabase:
   pnpm dlx supabase@2.106.0 link --project-ref <project-ref>
3. Apply database migrations:
   pnpm setup:db
4. Start the app:
   pnpm dev

For deployed/shared environments, set APP_BASIC_AUTH_USER and
APP_BASIC_AUTH_PASSWORD to protect the UI and API routes.
EOF
