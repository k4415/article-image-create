import { describe, expect, it } from "vitest";
import { extractMediaCandidates } from "./extract";

describe("extractMediaCandidates", () => {
  it("extracts images, picture sources, videos, and CSS background images in source order", () => {
    const html = `
      <main>
        <img src="/img/fv.png" alt="first view" />
        <picture>
          <source srcset="/img/wide.webp 1200w, /img/mobile.webp 600w" />
          <img src="/img/fallback.jpg" />
        </picture>
        <div style="background-image: url('/img/bg.jpg')"></div>
        <video poster="/video/poster.jpg"><source src="/video/demo.mp4" type="video/mp4" /></video>
      </main>
    `;

    const results = extractMediaCandidates(html, "https://example.com/ab/test");

    expect(results.map((result) => `${result.mediaType}:${result.url}`)).toEqual([
      "image:https://example.com/img/fv.png",
      "image:https://example.com/img/wide.webp",
      "image:https://example.com/img/mobile.webp",
      "image:https://example.com/img/fallback.jpg",
      "image:https://example.com/img/bg.jpg",
      "image:https://example.com/video/poster.jpg",
      "video:https://example.com/video/demo.mp4",
    ]);
    expect(results.map((result) => result.sourceOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("deduplicates repeated urls while keeping the first occurrence", () => {
    const html = `
      <img src="/img/repeated.png" />
      <img src="https://example.com/img/repeated.png#ignored" />
    `;

    const results = extractMediaCandidates(html, "https://example.com/ab/test");

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/img/repeated.png");
  });

  it("extracts SquadBeyond lazy-loaded media and ignores placeholders", () => {
    const html = `
      <picture>
        <source type="image/webp" data-srcset="https://file.mysquadbeyond.com/uploads/article_photo/photo/1234/visual.webp" />
        <source type="image/avif" data-srcset="https://file.mysquadbeyond.com/uploads/article_photo/photo/1234/visual.avif" />
        <img src="https://file.mysquadbeyond.com/lazy.png" alt="悩み画像" data-src="https://file.mysquadbeyond.com/uploads/article_photo/photo/1234/visual.jpg" />
      </picture>
      <video data-poster="https://file.mysquadbeyond.com/uploads/article_photo/photo/5678/poster.jpg">
        <source data-src="https://file.mysquadbeyond.com/uploads/article_photo/photo/5678/movie.h265.mp4" type="video/mp4;codecs=hvc1" />
        <source data-src="https://file.mysquadbeyond.com/uploads/article_photo/photo/5678/movie.mp4" type="video/mp4" />
      </video>
      <img src="https://id.mysquadbeyond.com/pixel.gif?article_uid=test" />
    `;

    const results = extractMediaCandidates(html, "https://example.com/ab/test");

    expect(results.map((result) => `${result.mediaType}:${result.url}`)).toEqual([
      "image:https://file.mysquadbeyond.com/uploads/article_photo/photo/1234/visual.jpg",
      "image:https://file.mysquadbeyond.com/uploads/article_photo/photo/5678/poster.jpg",
      "video:https://file.mysquadbeyond.com/uploads/article_photo/photo/5678/movie.mp4",
    ]);
    expect(results[0]?.altText).toBe("悩み画像");
  });
});
