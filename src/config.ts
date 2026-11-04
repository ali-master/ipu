export function resolveSiteURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SITE_URL must be an absolute HTTP(S) origin.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    /[<>&"']/.test(url.origin)
  )
    throw new Error(
      "SITE_URL must be an HTTP(S) origin without credentials, path, query or fragment.",
    );
  return url.origin;
}

export const siteURL = resolveSiteURL(
  Bun.env.SITE_URL?.trim() || `http://localhost:${Bun.env.PORT || "3000"}`,
);
