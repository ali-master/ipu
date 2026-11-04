import { normalizeIP } from "../ip";

export const traceURL = "https://cloudflare.com/cdn-cgi/trace";

export function parseTrace(text: string): Record<string, string> {
  if (text.length > 65_536) throw new Error("Trace response is too large.");
  const fields = new Map<string, string>();
  for (const line of text.trim().split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (separator < 1 || !/^[a-z][a-z0-9_]*$/i.test(key) || fields.has(key))
      throw new Error("Invalid Cloudflare trace response.");
    fields.set(key, line.slice(separator + 1));
  }
  normalizeIP(fields.get("ip") ?? "");
  if (!/^[A-Z]{3}$/.test(fields.get("colo") ?? ""))
    throw new Error("Cloudflare data center is missing.");
  return Object.fromEntries(fields);
}
