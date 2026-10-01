import {
  Action,
  Alert,
  ActionPanel,
  Detail,
  Icon,
  Keyboard,
  Toast,
  confirmAlert,
  showToast,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { useState } from "react";
import { useCachedPromise, useFetch } from "@raycast/utils";
import { API_BASE, LookupKind, apiOptions, cleanDomain, describeError, formatDate } from "./api";
import { DnsView } from "./dns-view";
import { HistoryEntry, addToHistory, clearHistory, getHistory, removeFromHistory } from "./history";
import { Event, WhoisResponse } from "./types";

function titleCase(value: string): string {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Registries often append an ICANN reference URL, e.g. "clientTransferProhibited https://icann.org/epp#..."
function cleanStatus(status: string): string {
  return status.split(/\s+/)[0];
}

function hostname(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function findEvent(events: Event[], ...actions: string[]): string | undefined {
  const match = events.find((e) => actions.includes(e.event_action.toLowerCase()));
  return match ? formatDate(match.event_date) : undefined;
}

const FIELD_LABELS: Record<string, string> = {
  address1: "Address",
  address2: "Address (cont.)",
  state_province: "State/Province",
};

function buildMarkdown(data: WhoisResponse, savedAt?: string): string {
  const lines = [`# ${data.domain}`, ""];

  if (data.events.length) {
    lines.push("## Events", "");
    for (const e of data.events) lines.push(`- **${titleCase(e.event_action)}:** ${formatDate(e.event_date)}`);
    lines.push("");
  }

  for (const [role, contact] of Object.entries(data.contacts)) {
    const fields = Object.entries(contact).filter(([, v]) => v);
    if (!fields.length) continue;
    lines.push(`## ${titleCase(role)} Contact`, "");
    for (const [key, value] of fields) lines.push(`- **${FIELD_LABELS[key] ?? titleCase(key)}:** ${value}`);
    lines.push("");
  }

  lines.push(`_Snapshot from ${new Date(data.snapshot_time).toLocaleString()}_`);
  if (savedAt) lines.push("", `_Saved lookup from ${new Date(savedAt).toLocaleString()} · ⌘R to refresh_`);
  return lines.join("\n");
}

function errorMarkdown(domain: string, error: Error): string {
  const { title, message } = describeError(error, "No WHOIS record was found for this domain.");
  return `# ${title}\n\n**${domain}** — ${message}`;
}

const lookupView = (kind: LookupKind, domain: string, saved?: HistoryEntry) =>
  kind === "dns" ? <DnsView domain={domain} /> : <WhoisDetail domain={domain} saved={saved} />;

// The domain prompt for both commands; the history is shared, the primary action follows `kind`.
export function DomainPrompt({ kind }: { kind: LookupKind }) {
  const [text, setText] = useState("");
  const domain = cleanDomain(text);
  const { data: history = [], isLoading, revalidate } = useCachedPromise(getHistory);
  // Raycast fires onPop mid-render of its navigation stack; defer so the state update lands afterwards.
  const reloadHistory = () => setTimeout(revalidate, 0);
  const matches = history.filter((e) => e.domain.includes(domain));
  const showLookup = domain && !history.some((e) => e.domain === domain);

  async function remove(entry: HistoryEntry) {
    await removeFromHistory(entry.domain);
    revalidate();
  }

  async function clearAll() {
    const confirmed = await confirmAlert({
      title: "Clear lookup history?",
      message: `This removes all ${history.length} saved lookups.`,
      primaryAction: { title: "Clear History", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    await clearHistory();
    revalidate();
    await showToast({ style: Toast.Style.Success, title: "History cleared" });
  }

  return (
    <List
      isLoading={isLoading}
      searchText={text}
      onSearchTextChange={setText}
      searchBarPlaceholder="Enter a domain, or search your history"
    >
      {showLookup && (
        <List.Section title="Look Up">
          <List.Item
            title={domain}
            icon={Icon.MagnifyingGlass}
            actions={
              <ActionPanel>
                <Action.Push
                  title={kind === "dns" ? "Look up DNS" : "Look up WHOIS"}
                  icon={Icon.MagnifyingGlass}
                  target={lookupView(kind, domain)}
                  onPop={reloadHistory}
                />
                <Action.Push
                  title={kind === "dns" ? "Look up WHOIS" : "Look up DNS"}
                  icon={Icon.MagnifyingGlass}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  target={lookupView(kind === "dns" ? "whois" : "dns", domain)}
                  onPop={reloadHistory}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="History" subtitle={matches.length ? String(matches.length) : undefined}>
        {matches.map((entry) => (
          <List.Item
            key={entry.domain}
            title={entry.domain}
            subtitle={entry.registrar ?? undefined}
            icon={Icon.Globe}
            accessories={[
              ...(entry.expires ? [{ tag: `Expires ${entry.expires}` }] : []),
              { date: new Date(entry.lookedUpAt), tooltip: "Looked up" },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title={kind === "dns" ? "Show DNS Records" : "Show WHOIS"}
                  icon={Icon.Eye}
                  target={lookupView(kind, entry.domain, entry)}
                  onPop={reloadHistory}
                />
                <Action.Push
                  title={kind === "dns" ? "Show WHOIS" : "Show DNS Records"}
                  icon={Icon.Eye}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  target={lookupView(kind === "dns" ? "whois" : "dns", entry.domain, entry)}
                  onPop={reloadHistory}
                />
                <Action.OpenInBrowser title="Open on Who.is" url={`https://who.is/whois/${entry.domain}`} />
                <Action.CopyToClipboard title="Copy Domain" content={entry.domain} />
                <Action
                  title="Remove from History"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                  onAction={() => remove(entry)}
                />
                <Action
                  title="Clear All History"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.RemoveAll}
                  onAction={clearAll}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {!domain && !history.length && <List.EmptyView icon={Icon.Globe} title="Type a domain to look it up" />}
    </List>
  );
}

// With a saved record, show it without calling the API until the user refreshes.
export function WhoisDetail({ domain, saved }: { domain: string; saved?: HistoryEntry }) {
  const [refreshed, setRefreshed] = useState(!saved?.record);

  const {
    data: fetched,
    error,
    isLoading,
    revalidate,
  } = useFetch<WhoisResponse>(`${API_BASE}/whois/${encodeURIComponent(domain)}`, {
    ...apiOptions<WhoisResponse>(),
    execute: refreshed,
    keepPreviousData: false,
    failureToastOptions: { title: `WHOIS lookup failed for ${domain}` },
    onData: (result) =>
      addToHistory({
        domain: result.domain,
        registrar: result.registrar,
        expires: findEvent(result.events, "expiration", "expires"),
        lookedUpAt: new Date().toISOString(),
        record: result,
      }),
  });

  const showingSaved = !refreshed && saved?.record;
  const data = refreshed ? fetched : saved?.record;
  const markdown =
    error && !data
      ? errorMarkdown(domain, error)
      : data
        ? buildMarkdown(data, showingSaved ? saved?.lookedUpAt : undefined)
        : `# ${domain}\n\nLooking up…`;

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={`WHOIS · ${domain}`}
      markdown={markdown}
      metadata={
        data && (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Registrar" text={data.registrar ?? "—"} />
            {data.referral_url && (
              <Detail.Metadata.Link
                title="Registrar URL"
                target={data.referral_url}
                text={hostname(data.referral_url)}
              />
            )}
            <Detail.Metadata.Label title="Created" text={findEvent(data.events, "registration", "created") ?? "—"} />
            <Detail.Metadata.Label title="Expires" text={findEvent(data.events, "expiration", "expires") ?? "—"} />
            <Detail.Metadata.Label
              title="Updated"
              text={findEvent(data.events, "last changed", "last update", "updated") ?? "—"}
            />
            <Detail.Metadata.Separator />
            {/* One row per value: labels truncate cleanly, whereas a long TagList widens the sidebar */}
            {data.nameservers.map((ns, i) => (
              <Detail.Metadata.Label
                key={`ns-${ns.ldh_name}`}
                title={i === 0 ? "Nameservers" : ""}
                text={ns.ldh_name.toLowerCase()}
              />
            ))}
            {data.statuses.length > 0 && <Detail.Metadata.Separator />}
            {data.statuses.map((s, i) => (
              <Detail.Metadata.Label key={`status-${s}`} title={i === 0 ? "Status" : ""} text={cleanStatus(s)} />
            ))}
            {data.whois_server && <Detail.Metadata.Separator />}
            {data.whois_server && <Detail.Metadata.Label title="WHOIS Server" text={data.whois_server} />}
          </Detail.Metadata>
        )
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open on Who.is" url={`https://who.is/whois/${domain}`} />
          <Action.Push
            title="Show DNS Records"
            icon={Icon.List}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
            target={<DnsView domain={domain} />}
          />
          {data && <Action.CopyToClipboard title="Copy JSON" content={JSON.stringify(data, null, 2)} />}
          {data && (
            <Action.CopyToClipboard
              title="Copy Nameservers"
              content={data.nameservers.map((ns) => ns.ldh_name.toLowerCase()).join("\n")}
            />
          )}
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={() => (refreshed ? revalidate() : setRefreshed(true))}
          />
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}
