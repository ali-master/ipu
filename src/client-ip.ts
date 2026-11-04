import ipaddr from "ipaddr.js";
import { normalizeIP } from "./lookup";

export function vercelClientIP(request: Request): string | null {
  // Trust this platform-owned header only inside the Vercel deployment.
  if (Bun.env.VERCEL !== "1") return null;
  try {
    return normalizeIP(request.headers.get("x-vercel-forwarded-for") ?? "");
  } catch {
    return null;
  }
}

export function createClientResolver(trusted = "") {
  const networks = trusted
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [ip, bits] = s.split("/");
      const normalized = normalizeIP(ip!);
      return ipaddr.parseCIDR(
        `${normalized}/${bits ?? (normalized.includes(":") ? 128 : 32)}`,
      );
    });
  const isTrusted = (ip: string) => {
    const address = ipaddr.parse(ip);
    return networks.some(
      ([network, prefix]) =>
        address.kind() === network.kind() && address.match(network, prefix),
    );
  };
  return (request: Request, remote: string | null): string | null => {
    if (!remote) return null;
    const peer = normalizeIP(remote);
    if (!isTrusted(peer)) return peer;
    const forwarded = request.headers.get("x-forwarded-for");
    if (!forwarded || forwarded.length > 2048) return peer;
    try {
      const chain = forwarded.split(",").map(normalizeIP);
      // Walk from our trusted peer inward, stopping at the first untrusted hop.
      let client = peer;
      for (let i = chain.length - 1; i >= 0 && isTrusted(client); i--)
        client = chain[i]!;
      return client;
    } catch {
      return peer;
    }
  };
}
