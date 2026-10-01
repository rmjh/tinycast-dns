import { getPreferenceValues } from "@raycast/api";

export const API_BASE = "https://api.who.is/v1";

type Problem = { type?: string; title?: string; status?: number; detail?: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail || problem.title || `Request failed with status ${status}`);
  }
}

// Shared useFetch options: Bearer auth, and RFC 7807 problem bodies turned into ApiError.
export function apiOptions<T>() {
  const { apiKey } = getPreferenceValues<Preferences>();
  return {
    headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/json" },
    async parseResponse(response: Response): Promise<T> {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, body as Problem);
      return body as T;
    },
  };
}

export function describeError(error: Error, notFound: string): { title: string; message: string } {
  if (!(error instanceof ApiError)) return { title: "Lookup failed", message: error.message };
  const hints: Record<string, string> = {
    unauthorized: "Check your API key in the extension preferences (⌘⇧, to open).",
    not_found: notFound,
    domain_not_available: notFound,
    invalid_domain: "That doesn't look like a valid domain name.",
    rate_limited: "Too many requests — wait a moment and try again.",
    quota_exceeded: "Your monthly who.is credits are used up.",
  };
  const hint = (error.problem.type && hints[error.problem.type]) || "";
  return { title: error.problem.title || "Lookup failed", message: [error.message, hint].filter(Boolean).join(" ") };
}

export function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, "");
}

export type LookupKind = "whois" | "dns";

// Fallback commands receive the whole root search text, e.g. "dns example.com" or "whois example.com".
export function parseLaunchText(text: string, defaultKind: LookupKind): { kind: LookupKind; domain: string } {
  const match = text.trim().match(/^(whois|dns)\s+(.*)$/i);
  if (match) return { kind: match[1].toLowerCase() as LookupKind, domain: cleanDomain(match[2]) };
  return { kind: defaultKind, domain: cleanDomain(text) };
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}
