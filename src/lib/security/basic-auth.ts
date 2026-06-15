export type BasicAuthCredentials = {
  user?: string | null;
  password?: string | null;
};

function hasCredentials(credentials: BasicAuthCredentials) {
  return Boolean(credentials.user && credentials.password);
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function decodeBasicAuth(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) return null;
  try {
    const decoded = globalThis.atob(authorizationHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function isBasicAuthAllowed(authorizationHeader: string | null, credentials: BasicAuthCredentials) {
  if (!hasCredentials(credentials)) return true;
  const parsed = decodeBasicAuth(authorizationHeader);
  if (!parsed) return false;
  return safeEqual(parsed.user, credentials.user ?? "") && safeEqual(parsed.password, credentials.password ?? "");
}
