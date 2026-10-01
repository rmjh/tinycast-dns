import { Action, ActionPanel, Color, Icon, Keyboard, List, openExtensionPreferences } from "@raycast/api";
import { useFetch, usePromise } from "@raycast/utils";
import { ReactNode, useMemo } from "react";
import { HostingSummary, AsnInfo, lookupAsn, summarizeHosting } from "./hosting";
import { API_BASE, apiOptions, describeError, formatDate } from "./api";
import { DnsResponse } from "./types";

// Common types first, the rest alphabetically.
const TYPE_ORDER = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "CAA", "SRV"];
const typeRank = (t: string) => (TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : TYPE_ORDER.length);

const TYPE_COLORS: Record<string, Color> = {
  A: Color.Blue,
  AAAA: Color.Blue,
  CNAME: Color.Purple,
  MX: Color.Orange,
  NS: Color.Green,
  TXT: Color.SecondaryText,
};

function zoneText(data: DnsResponse): string {
  return data.hostnames
    .flatMap((h) =>
      Object.entries(h.records).flatMap(([type, values]) => values.map((v) => `${h.hostname}\t${type}\t${v}`)),
    )
    .join("\n");
}

function summarySentence(domain: string, h: HostingSummary, asn?: AsnInfo): string {
  const parts = [
    h.platform && `hosted on ${h.platform}`,
    asn && `served over ${asn.asn}`,
    h.managedDns && `DNS by ${h.managedDns}`,
    h.email && h.email !== "Other" && `email via ${h.email}`,
  ].filter(Boolean);
  return parts.length ? `${domain} is ${parts.join(", ")}.` : "";
}

function HostingSection({ domain, hosting, actions }: { domain: string; hosting: HostingSummary; actions: ReactNode }) {
  const { data: asn, isLoading } = usePromise(lookupAsn, [hosting.ip ?? ""], { execute: !!hosting.ip });
  const rows: { label: string; value: string; icon: Icon; detail?: string; muted?: boolean }[] = [
    { label: "Platform", value: hosting.platform ?? "Unknown", icon: Icon.AppWindow, muted: !hosting.platform },
    {
      label: "Hosting Network",
      value: asn ? `${asn.asn} · ${asn.name}` : isLoading ? "Looking up…" : "Unknown",
      icon: Icon.Network,
      detail: asn ? `${asn.prefix} · ${asn.country}` : hosting.ip,
      muted: !asn,
    },
    { label: "Managed DNS", value: hosting.managedDns ?? "Unknown", icon: Icon.HardDrive, muted: !hosting.managedDns },
    { label: "Email", value: hosting.email ?? "No MX records", icon: Icon.Envelope, muted: !hosting.email },
    { label: "IPv6 (AAAA)", value: hosting.ipv6 ? "Enabled" : "Not enabled", icon: Icon.Globe, muted: !hosting.ipv6 },
    {
      label: "CAA Pinning",
      value: hosting.caa.length ? hosting.caa.join(", ") : "None",
      icon: Icon.Lock,
      muted: !hosting.caa.length,
    },
  ];

  return (
    <List.Section title="Hosting & Network" subtitle={summarySentence(domain, hosting, asn)}>
      {rows.map((row) => (
        <List.Item
          key={row.label}
          icon={{ source: row.icon, tintColor: row.muted ? Color.SecondaryText : Color.PrimaryText }}
          title={row.label}
          subtitle={row.value}
          keywords={[row.value]}
          accessories={row.detail ? [{ text: row.detail }] : []}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Value" content={row.value} />
              {actions}
            </ActionPanel>
          }
        />
      ))}
    </List.Section>
  );
}

export function DnsView({ domain }: { domain: string }) {
  const { data, error, isLoading, revalidate } = useFetch<DnsResponse>(
    `${API_BASE}/dns/${encodeURIComponent(domain)}`,
    {
      ...apiOptions<DnsResponse>(),
      keepPreviousData: false,
      failureToastOptions: { title: `DNS lookup failed for ${domain}` },
    },
  );

  const hosting = useMemo(() => (data ? summarizeHosting(data) : undefined), [data]);

  const sharedActions = (
    <>
      <Action.OpenInBrowser title="Open on Who.is" url={`https://who.is/dns/${domain}`} />
      {data && <Action.CopyToClipboard title="Copy All Records" content={zoneText(data)} />}
      {data && <Action.CopyToClipboard title="Copy JSON" content={JSON.stringify(data, null, 2)} />}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={revalidate}
      />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </>
  );

  if (error && !data) {
    const { title, message } = describeError(error, "who.is has no DNS records for this domain.");
    return (
      <List navigationTitle={`DNS · ${domain}`}>
        <List.EmptyView
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
          title={title}
          description={message}
          actions={<ActionPanel>{sharedActions}</ActionPanel>}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={data ? `DNS · ${domain} · snapshot ${formatDate(data.snapshot_time)}` : `DNS · ${domain}`}
      searchBarPlaceholder="Filter records by value, type or hostname"
    >
      {hosting && <HostingSection domain={domain} hosting={hosting} actions={sharedActions} />}
      {data?.hostnames.map((host) => {
        const provider = [host.provider_name, host.hosting_class].filter(Boolean).join(" · ");
        const records = Object.entries(host.records)
          .sort(([a], [b]) => typeRank(a) - typeRank(b) || a.localeCompare(b))
          .flatMap(([type, values]) => values.map((value) => ({ type, value })));

        return (
          <List.Section key={host.hostname} title={host.hostname} subtitle={provider}>
            {records.map(({ type, value }) => (
              <List.Item
                key={`${type}-${value}`}
                title={value}
                keywords={[type, host.hostname]}
                accessories={[{ tag: { value: type, color: TYPE_COLORS[type] ?? Color.SecondaryText } }]}
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard title="Copy Value" content={value} />
                    <Action.CopyToClipboard
                      title="Copy Record"
                      content={`${host.hostname}\t${type}\t${value}`}
                      shortcut={Keyboard.Shortcut.Common.CopyName}
                    />
                    {sharedActions}
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
