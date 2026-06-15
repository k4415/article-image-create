# Architecture

This application is an internal operations tool for article LP asset management and image generation.

## Main Flows

### 1. Asset Ingest

1. The operator submits article LP URLs from `/ingest`.
2. The server downloads candidate images and video assets.
3. Images are stored in Supabase Storage.
4. Metadata is stored in Supabase tables.
5. OpenAI Vision creates searchable annotations such as product name, problem category, target gender, target age band, image category, OCR text, and visual description.
6. Embeddings are stored for semantic search.

### 2. Asset Search

The asset list and editor reference panel use two search styles:

- Keyword/filter search via `GET /api/assets`
- Semantic search via `POST /api/search/semantic`

Filters include:

- media type
- problem category
- image category
- target gender
- target age band
- product name
- free text query

### 3. Image Generation Editor

1. `/editor` creates or opens an `editor_sessions` project.
2. The operator edits an article structure draft.
3. The operator selects one target line and reference images.
4. The app creates a generation batch in `image_generation_batches`.
5. Jobs are stored in `generated_images`.
6. The in-app worker builds a prompt plan from the article text, target line, reference image metadata, and reference image pixels.
7. `gpt-image-2` generates or edits an image.
8. The generated image is uploaded to Supabase Storage and appears in the preview and generation history.

### 4. Project Persistence

Editor projects are stored in `editor_sessions`.

- `title`: human-readable project title
- `article_text`: latest article draft
- `image_blocks`: generated image placements
- `editor_state`: selected target line, filters, search query, selected reference assets, prompt settings, editor mode
- `last_saved_at`: latest autosave time

Only the latest editor state is stored. Generated images and revision history remain in `generated_images`.

## Data Storage

- Supabase Database stores metadata, jobs, sessions, annotations, and generation history.
- Supabase Storage stores source assets, thumbnails, uploaded reference images, and generated images.
- OpenAI is used for annotation, embeddings, prompt planning, reference design analysis, and image generation.

## Security Boundary

The browser never receives `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY`. Server-side route handlers use those secrets through environment variables.

Because server routes can perform privileged DB writes and paid OpenAI calls, deployed instances must be protected. The app includes optional HTTP Basic Auth through `APP_BASIC_AUTH_USER` and `APP_BASIC_AUTH_PASSWORD`; larger deployments should use a dedicated identity/access layer.
