const UNSUPPORTED_PROTOCOLS = new Set(["data:", "javascript:", "mailto:", "tel:", "blob:"]);

export function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  const sortedParams = new URLSearchParams();
  Array.from(url.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, paramValue]) => sortedParams.append(key, paramValue));
  url.search = sortedParams.toString();

  return url.toString();
}

export function resolveCandidateUrl(candidate: string | null | undefined, baseUrl: string): string | null {
  if (!candidate) {
    return null;
  }

  const trimmed = candidate.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    if (UNSUPPORTED_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return normalizeUrl(url.toString());
  } catch {
    return null;
  }
}

export function getFileExtension(mediaUrl: string): string {
  try {
    const pathname = new URL(mediaUrl).pathname;
    const fileName = pathname.split("/").pop() ?? "";
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
    return extension ? extension.toLowerCase() : "bin";
  } catch {
    return "bin";
  }
}
