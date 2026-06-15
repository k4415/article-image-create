import { describe, expect, it } from "vitest";
import { getFileExtension, normalizeUrl, resolveCandidateUrl } from "./url";

describe("url helpers", () => {
  it("normalizes urls by trimming, removing hashes, and sorting query params", () => {
    expect(normalizeUrl(" HTTPS://Example.com/path?b=2&a=1#section ")).toBe(
      "https://example.com/path?a=1&b=2",
    );
  });

  it("resolves relative media urls against an article url", () => {
    expect(resolveCandidateUrl("/images/fv.png", "https://example.com/ab/page")).toBe(
      "https://example.com/images/fv.png",
    );
  });

  it("ignores inline and unsupported url schemes", () => {
    expect(resolveCandidateUrl("data:image/png;base64,abc", "https://example.com")).toBeNull();
    expect(resolveCandidateUrl("javascript:void(0)", "https://example.com")).toBeNull();
  });

  it("extracts a stable extension from media urls", () => {
    expect(getFileExtension("https://example.com/assets/banner.webp?cache=1")).toBe("webp");
    expect(getFileExtension("https://example.com/assets/no-extension")).toBe("bin");
  });
});
