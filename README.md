# Article LP Asset DB / Image Generation Editor

記事LPで使う画像・動画素材を取り込み、検索・分類・再利用しながら、記事構成案に合わせたLP画像を生成する管理アプリです。

主な用途は次の3つです。

- 記事LP URLから画像・動画ラストカットを抽出し、Supabase Storage / DBに保存する
- 悩みカテゴリ、画像カテゴリ、性別、年代、商材名、自由記述で参考画像を検索する
- 記事構成案の指定行に対して、参考画像のレイアウトを使いながら `gpt-image-2` で画像生成し、履歴・修正生成・プロジェクト再編集を行う

## Features

- 素材DB
  - URL取り込み、重複判定、画像 / 動画ラストカット保存
  - OpenAI Visionによる素材メタデータ付与
  - キーワード検索、意味検索、カテゴリ・ターゲット属性フィルタ

- 画像生成エディタ
  - 記事構成案の編集 / スマホ縦長プレビュー
  - 参考画像DB検索と複数参考画像選択
  - `gpt-image-2` による画像生成、バックグラウンド生成履歴
  - 生成済み画像の詳細プロンプト確認と修正生成
  - タイトル付きプロジェクト保存、履歴から再編集

- 運用
  - Supabase migrations同梱
  - `.env.local.example` 同梱
  - 共有環境向けの任意Basic認証

## Tech Stack

- Next.js 16 App Router
- React 19
- Supabase Database / Storage
- OpenAI Responses API / Image API
- Vitest / ESLint / Playwright

## Quick Setup

Prerequisites:

- Node.js 20+
- pnpm
- Supabase project
- OpenAI API key

```bash
corepack enable
pnpm setup
```

`pnpm setup` installs dependencies and creates `.env.local` from `.env.local.example` if it does not exist.

AI setup helper:

- If you downloaded this folder and want an AI agent to set it up, ask from the repository root: `セットアップして`
- The project-local setup skill is at `.codex/skills/article-image-create-setup/SKILL.md`

Edit `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-5.4-mini
OPENAI_PROMPT_MODEL=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
LP_ASSET_BUCKET=lp-assets
IMAGE_GENERATION_CONCURRENCY=2
IMAGE_GENERATION_BATCH_LIMIT=10
APP_BASIC_AUTH_USER=
APP_BASIC_AUTH_PASSWORD=
```

Link Supabase and apply migrations:

```bash
pnpm dlx supabase@2.106.0 link --project-ref <project-ref>
pnpm setup:db
```

Start the app:

```bash
pnpm dev
```

Open:

- `http://localhost:3000/` - asset list
- `http://localhost:3000/ingest` - URL ingest
- `http://localhost:3000/editor` - image generation editor

## Production / Shared Deployment

This app uses `SUPABASE_SERVICE_ROLE_KEY` on server-side API routes. Do not expose it to the browser and do not deploy this app publicly without access control.

For simple shared deployments, set both values:

```bash
APP_BASIC_AUTH_USER=<shared-user>
APP_BASIC_AUTH_PASSWORD=<strong-password>
```

When both are set, every page and API route is protected by HTTP Basic Auth. For larger teams, put the app behind SSO, VPN, Vercel Authentication, Cloudflare Access, or a similar access layer.

## Useful Commands

```bash
pnpm dev          # start local development server
pnpm test         # run unit tests
pnpm lint         # run ESLint
pnpm build        # typecheck and production build
pnpm check        # lint + test + build
pnpm setup:db     # apply Supabase migrations
```

## Important Project Rule

When generating images that include text, do not add text later with HTML, CSS, screenshots, Python, Pillow, canvas export, or other post-processing. Put the desired Japanese copy directly into the image generation prompt and generate the visual and text together.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Security Review](SECURITY.md)
