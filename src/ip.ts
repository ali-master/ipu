import ipaddr from "ipaddr.js";

export function normalizeIP(input: string): string {
  const value = input.trim();
  if (
    value.length > 45 ||
    value.includes("%") ||
    (value.includes(".") &&
      !ipaddr.IPv4.isValidFourPartDecimal(
        value.slice(value.lastIndexOf(":") + 1),
      )) ||
    !(
      ipaddr.IPv4.isValidFourPartDecimal(value) ||
      (value.includes(":") && ipaddr.IPv6.isValid(value))
    )
  )
    throw new Error("Enter a valid IPv4 or IPv6 address.");
  return ipaddr.process(value).toString();
}
