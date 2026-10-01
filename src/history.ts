import { LocalStorage } from "@raycast/api";
import { WhoisResponse } from "./types";

const KEY = "lookup-history";
const MAX_ENTRIES = 100;

export type HistoryEntry = {
  domain: string;
  registrar: string | null;
  expires?: string;
  lookedUpAt: string;
  // Full API response, so saved lookups reopen without spending a credit. Missing on entries saved before caching.
  record?: WhoisResponse;
};

export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await LocalStorage.getItem<string>(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

async function saveHistory(entries: HistoryEntry[]) {
  await LocalStorage.setItem(KEY, JSON.stringify(entries));
}

// Most recent first; looking a domain up again moves it back to the top.
export async function addToHistory(entry: HistoryEntry) {
  const entries = (await getHistory()).filter((e) => e.domain !== entry.domain);
  await saveHistory([entry, ...entries].slice(0, MAX_ENTRIES));
}

export async function removeFromHistory(domain: string) {
  await saveHistory((await getHistory()).filter((e) => e.domain !== domain));
}

export async function clearHistory() {
  await LocalStorage.removeItem(KEY);
}
