import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  InsertSignal,
  InsertSignalInsight,
  InsertSignalProfile,
  SignalIngestionRun,
  SignalInsight,
  SignalProfile,
} from "../drizzle/schema";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(REPO_ROOT, ".data");
const STORE_PATH = join(DATA_DIR, "local-signals.json");

type SignalRow = {
  id: number;
  organizationId: number;
  source: string;
  externalId: string;
  signalType: string;
  companyName: string;
  headline: string;
  url: string;
  tags: string[];
  occurredAt: string;
  ingestedAt: string;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
};

type SignalInsightRow = {
  id: number;
  signalId: number;
  summaryShort: string;
  actionSuggestion: string;
  reasoning: string | null;
  relevanceScore: number;
  vertical: string | null;
  createdAt: string;
  updatedAt: string;
};

type SignalProfileRow = {
  id: number;
  organizationId: number;
  businessType: string;
  selectedTags: string[];
  selectedSignalTypes: string[];
  sourcesEnabled: string[];
  refreshCadenceMinutes: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type SignalRunRow = {
  id: number;
  organizationId: number;
  source: string;
  status: "started" | "completed" | "failed";
  fetchedCount: number;
  insertedCount: number;
  summarizedCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type StoreFile = {
  signalProfiles: SignalProfileRow[];
  signals: SignalRow[];
  signalInsights: SignalInsightRow[];
  signalIngestionRuns: SignalRunRow[];
  nextSignalProfileId: number;
  nextSignalId: number;
  nextSignalInsightId: number;
  nextSignalRunId: number;
};

let queue = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function nowIso() {
  return new Date().toISOString();
}

async function loadStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return {
      signalProfiles: parsed.signalProfiles ?? [],
      signals: parsed.signals ?? [],
      signalInsights: parsed.signalInsights ?? [],
      signalIngestionRuns: parsed.signalIngestionRuns ?? [],
      nextSignalProfileId: parsed.nextSignalProfileId ?? 1,
      nextSignalId: parsed.nextSignalId ?? 1,
      nextSignalInsightId: parsed.nextSignalInsightId ?? 1,
      nextSignalRunId: parsed.nextSignalRunId ?? 1,
    };
  } catch {
    return {
      signalProfiles: [],
      signals: [],
      signalInsights: [],
      signalIngestionRuns: [],
      nextSignalProfileId: 1,
      nextSignalId: 1,
      nextSignalInsightId: 1,
      nextSignalRunId: 1,
    };
  }
}

async function saveStore(store: StoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function normalizeProfile(row: SignalProfileRow): SignalProfile {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function devGetSignalProfile(organizationId: number): Promise<SignalProfile | undefined> {
  return serialized(async () => {
    const store = await loadStore();
    const row = store.signalProfiles.find(p => p.organizationId === organizationId);
    return row ? normalizeProfile(row) : undefined;
  });
}

export async function devUpsertSignalProfile(
  organizationId: number,
  data: Omit<InsertSignalProfile, "organizationId">,
): Promise<void> {
  return serialized(async () => {
    const store = await loadStore();
    const idx = store.signalProfiles.findIndex(p => p.organizationId === organizationId);
    const existing = idx >= 0 ? store.signalProfiles[idx] : undefined;
    const now = nowIso();
    const row: SignalProfileRow = {
      id: existing?.id ?? store.nextSignalProfileId++,
      organizationId,
      businessType: String(data.businessType),
      selectedTags: (data.selectedTags ?? []) as string[],
      selectedSignalTypes: (data.selectedSignalTypes ?? []) as string[],
      sourcesEnabled: (data.sourcesEnabled ?? []) as string[],
      refreshCadenceMinutes: Number(data.refreshCadenceMinutes ?? 30),
      isEnabled: Boolean(data.isEnabled),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (idx >= 0) store.signalProfiles[idx] = row;
    else store.signalProfiles.push(row);
    await saveStore(store);
  });
}

export async function devGetEnabledSignalProfiles(): Promise<SignalProfile[]> {
  return serialized(async () => {
    const store = await loadStore();
    return store.signalProfiles.filter(p => p.isEnabled).map(normalizeProfile);
  });
}

export async function devCreateSignalIngestionRun(input: {
  organizationId: number;
  source: string;
}): Promise<number> {
  return serialized(async () => {
    const store = await loadStore();
    const id = store.nextSignalRunId++;
    store.signalIngestionRuns.push({
      id,
      organizationId: input.organizationId,
      source: input.source,
      status: "started",
      fetchedCount: 0,
      insertedCount: 0,
      summarizedCount: 0,
      errorMessage: null,
      startedAt: nowIso(),
      finishedAt: null,
    });
    await saveStore(store);
    return id;
  });
}

export async function devCompleteSignalIngestionRun(input: {
  id: number;
  status: "completed" | "failed";
  fetchedCount?: number;
  insertedCount?: number;
  summarizedCount?: number;
  errorMessage?: string;
}): Promise<void> {
  return serialized(async () => {
    const store = await loadStore();
    const idx = store.signalIngestionRuns.findIndex(r => r.id === input.id);
    if (idx < 0) return;
    store.signalIngestionRuns[idx] = {
      ...store.signalIngestionRuns[idx],
      status: input.status,
      fetchedCount: input.fetchedCount ?? 0,
      insertedCount: input.insertedCount ?? 0,
      summarizedCount: input.summarizedCount ?? 0,
      errorMessage: input.errorMessage ?? null,
      finishedAt: nowIso(),
    };
    await saveStore(store);
  });
}

export async function devUpsertSignalItem(
  data: InsertSignal,
): Promise<{ inserted: boolean; id: number | null }> {
  return serialized(async () => {
    const store = await loadStore();
    const idx = store.signals.findIndex(s => s.externalId === data.externalId);
    if (idx >= 0) {
      const existing = store.signals[idx];
      store.signals[idx] = {
        ...existing,
        headline: String(data.headline),
        url: String(data.url),
        tags: (data.tags ?? []) as string[],
        rawPayload: (data.rawPayload ?? null) as Record<string, unknown> | null,
        occurredAt: new Date(data.occurredAt as Date).toISOString(),
      };
      await saveStore(store);
      return { inserted: false, id: existing.id };
    }

    const id = store.nextSignalId++;
    store.signals.push({
      id,
      organizationId: Number(data.organizationId),
      source: String(data.source),
      externalId: String(data.externalId),
      signalType: String(data.signalType),
      companyName: String(data.companyName),
      headline: String(data.headline),
      url: String(data.url),
      tags: (data.tags ?? []) as string[],
      occurredAt: new Date(data.occurredAt as Date).toISOString(),
      ingestedAt: data.ingestedAt ? new Date(data.ingestedAt as Date).toISOString() : nowIso(),
      rawPayload: (data.rawPayload ?? null) as Record<string, unknown> | null,
      createdAt: nowIso(),
    });
    await saveStore(store);
    return { inserted: true, id };
  });
}

export async function devUpsertSignalInsight(
  signalId: number,
  data: Omit<InsertSignalInsight, "signalId">,
): Promise<void> {
  return serialized(async () => {
    const store = await loadStore();
    const idx = store.signalInsights.findIndex(i => i.signalId === signalId);
    const now = nowIso();
    const row: SignalInsightRow = {
      id: idx >= 0 ? store.signalInsights[idx].id : store.nextSignalInsightId++,
      signalId,
      summaryShort: String(data.summaryShort),
      actionSuggestion: String(data.actionSuggestion),
      reasoning: data.reasoning ? String(data.reasoning) : null,
      relevanceScore: Number(data.relevanceScore ?? 0),
      vertical: data.vertical ? String(data.vertical) : null,
      createdAt: idx >= 0 ? store.signalInsights[idx].createdAt : now,
      updatedAt: now,
    };
    if (idx >= 0) store.signalInsights[idx] = row;
    else store.signalInsights.push(row);
    await saveStore(store);
  });
}

export async function devListSignals(opts: {
  organizationId: number;
  limit?: number;
  offset?: number;
  search?: string;
  source?: string;
  tag?: string;
  signalType?: string;
}) {
  return serialized(async () => {
    const store = await loadStore();
    let rows = store.signals.filter(s => s.organizationId === opts.organizationId);
    if (opts.search?.trim()) {
      const q = opts.search.toLowerCase();
      rows = rows.filter(
        s => s.companyName.toLowerCase().includes(q) || s.headline.toLowerCase().includes(q),
      );
    }
    if (opts.source) rows = rows.filter(s => s.source === opts.source);
    if (opts.signalType) rows = rows.filter(s => s.signalType === opts.signalType);
    if (opts.tag) rows = rows.filter(s => s.tags.includes(opts.tag!));
    rows.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));

    const total = rows.length;
    const limit = opts.limit ?? 30;
    const offset = opts.offset ?? 0;
    const page = rows.slice(offset, offset + limit);

    const items = page.map(row => {
      const insight = store.signalInsights.find(i => i.signalId === row.id);
      return {
        id: row.id,
        companyName: row.companyName,
        signalType: row.signalType,
        source: row.source,
        occurredAt: new Date(row.occurredAt),
        url: row.url,
        tags: row.tags,
        summaryShort: insight?.summaryShort ?? row.companyName,
        summaryDetail: insight?.reasoning ?? row.headline,
        companyWebsite: (row.rawPayload?.companyWebsite as string | undefined) ?? row.url,
        actionSuggestion: insight?.actionSuggestion ?? "No suggested action generated yet.",
      };
    });

    const dedupeKey = (item: { companyName: string; signalType: string; summaryShort: string }) =>
      `${item.companyName}|${item.signalType}|${item.summaryShort}`
        .toLowerCase()
        .replace(/[^a-z0-9|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const deduped: typeof items = [];
    const seen = new Set<string>();
    for (const item of items) {
      const key = dedupeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return { items: deduped, total };
  });
}

export async function devListSignalFacets(organizationId: number) {
  return serialized(async () => {
    const store = await loadStore();
    const rows = store.signals.filter(s => s.organizationId === organizationId);
    const sourceSet = new Set<string>();
    const signalTypeSet = new Set<string>();
    const tagSet = new Set<string>();
    for (const row of rows) {
      sourceSet.add(row.source);
      signalTypeSet.add(row.signalType);
      for (const tag of row.tags) tagSet.add(tag);
    }
    return {
      sources: Array.from(sourceSet).sort((a, b) => a.localeCompare(b)),
      signalTypes: Array.from(signalTypeSet).sort((a, b) => a.localeCompare(b)),
      tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    };
  });
}

export async function devResetSignalsForOrganization(organizationId: number): Promise<void> {
  return serialized(async () => {
    const store = await loadStore();
    store.signalProfiles = store.signalProfiles.filter(p => p.organizationId !== organizationId);
    const orgSignalIds = new Set(
      store.signals.filter(s => s.organizationId === organizationId).map(s => s.id),
    );
    store.signals = store.signals.filter(s => s.organizationId !== organizationId);
    store.signalInsights = store.signalInsights.filter(i => !orgSignalIds.has(i.signalId));
    store.signalIngestionRuns = store.signalIngestionRuns.filter(
      r => r.organizationId !== organizationId,
    );
    await saveStore(store);
  });
}
