import { siteURL } from "./config";
import type { IPInfo } from "./shared";

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const properties: Record<keyof IPInfo, object> = {
  ip: { type: "string", examples: ["1.1.1.1", "2606:4700:4700::1111"] },
  network: nullableString,
  network_source: { enum: ["asn", "city", null] },
  continent: nullableString,
  country: nullableString,
  country_code: nullableString,
  region: nullableString,
  city: nullableString,
  timezone: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  accuracy_radius: {
    ...nullableNumber,
    description: "Approximate accuracy radius in kilometres.",
  },
  asn: { type: ["integer", "null"] },
  asn_organization: nullableString,
  private_address: { type: "boolean" },
  ipv6: { type: "boolean" },
  address_type: { type: "string" },
  database: {
    type: "object",
    required: ["city", "asn"],
    properties: { city: { type: "string" }, asn: nullableString },
  },
};

const json = { schema: { $ref: "#/components/schemas/Lookup" } };
const text = { schema: { type: "string" } };
const error = {
  description: "Request failed. Inspect the error field.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
    },
  },
};

const paths: Record<string, object> = {};
for (const explicit of [false, true]) {
  for (const endpoint of ["", "json", "ip", "country", "network", "asn"]) {
    const path = explicit
      ? `/{ip}${endpoint ? `/${endpoint}` : ""}`
      : `/${endpoint}`;
    const operation = {
      summary: `${endpoint || "Summary"} for ${explicit ? "an explicit IP" : "the caller IP (or ?ip override)"}`,
      parameters: [
        ...(explicit
          ? [
              {
                name: "ip",
                in: "path",
                required: true,
                description: "IPv4 or IPv6 address. Takes precedence over ?ip.",
                schema: { type: "string" },
                example: "1.1.1.1",
              },
            ]
          : []),
        {
          name: "ip",
          in: "query",
          description:
            "Optional IPv4 or IPv6 address. Without an explicit IP, the caller is the agent/server making the request.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description:
            endpoint === "json"
              ? "Full JSON lookup."
              : "Plain text by default; Accept: application/json returns the full lookup. Summary routes return HTML for Accept: text/html (takes precedence over JSON).",
          content: {
            "application/json": json,
            ...(endpoint !== "json" ? { "text/plain": text } : {}),
            ...(!endpoint ? { "text/html": text } : {}),
          },
        },
        "400": error,
        "404": error,
        "503": error,
        "405": {
          description: "Only GET and HEAD are supported.",
          content: { "text/plain": text },
        },
      },
    };
    const id = `${explicit ? "lookup" : "caller"}${endpoint || "Summary"}`;
    paths[path] = {
      get: { ...operation, operationId: id },
      head: {
        summary: `${operation.summary} (headers only)`,
        operationId: `${id}Head`,
        parameters: operation.parameters,
        responses: Object.fromEntries(
          Object.entries(operation.responses).map(([status, response]) => [
            status,
            { description: response.description },
          ]),
        ),
      },
    };
  }
}
paths["/health"] = {
  get: {
    operationId: "health",
    summary: "Service readiness",
    responses: {
      "200": {
        description: "Service is running.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: { status: { const: "ok" } },
            },
          },
        },
      },
    },
  },
  head: {
    operationId: "healthHead",
    summary: "Service readiness (headers only)",
    responses: { "200": { description: "Service is running." } },
  },
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "IPU IP lookup API",
    version: "1.0.0",
    description:
      "Read-only IPv4 and IPv6 network, ASN and approximate geolocation lookup. No API key. Missing JSON fields are null; plain text uses Unavailable. Omitted IP means the caller's connection, not the end user's device.",
  },
  servers: [{ url: siteURL }],
  externalDocs: { url: `${siteURL}/docs` },
  security: [],
  paths,
  components: {
    schemas: {
      Lookup: {
        type: "object",
        required: [...Object.keys(properties), "meta"],
        properties: {
          ...properties,
          meta: {
            type: "object",
            required: ["cached", "lookup_ms"],
            properties: {
              cached: { type: "boolean" },
              lookup_ms: { type: "number" },
            },
          },
        },
      },
    },
  },
};
