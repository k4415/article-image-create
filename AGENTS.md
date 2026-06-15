<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Global Image Generation Rule

When generating images, do not use HTML, CSS, Python, Pillow, canvas export, screenshots, or other post-processing workflows to add or compose text. If the requested image includes text, include the text directly in the image-generation prompt and generate the visual and text together as one image.

This applies to banners, posters, social images, thumbnails, and any other text-in-image output. Prefer the image generation tool's native output over programmatic layout or later text overlay.
