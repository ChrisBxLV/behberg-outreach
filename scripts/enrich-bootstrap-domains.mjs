import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const INPUT_TXT = resolve(process.cwd(), "scripts", "bootstrap_companies_1000.txt");
const OUTPUT_CSV = resolve(process.cwd(), "scripts", "bootstrap_companies_1000_with_domains.csv");

const CONCURRENCY = 6;
const MAX_RETRIES = 3;

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(
      /\b(inc|incorporated|corp|corporation|co|company|group|holdings|holding|ltd|limited|plc|ag|llc|lp|sa|nv)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(value) {
  if (!value) return null;
  const d = String(value).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  return d.replace(/^www\./, "");
}

function scoreCandidate(companyName, candidateName) {
  const a = normalizeName(companyName);
  const b = normalizeName(candidateName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.startsWith(a) || a.startsWith(b)) return 80;
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  let overlap = 0;
  for (const w of aWords) if (bWords.has(w)) overlap++;
  const ratio = overlap / Math.max(1, aWords.size);
  return Math.round(ratio * 60);
}

function csvEscape(v) {
  const s = String(v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}

async function fetchSuggestions(name, attempt = 0) {
  const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "behberg-outreach-domain-bootstrap/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(500 * (attempt + 1));
        return fetchSuggestions(name, attempt + 1);
      }
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    if (attempt < MAX_RETRIES) {
      await sleep(400 * (attempt + 1));
      return fetchSuggestions(name, attempt + 1);
    }
    return [];
  }
}

async function resolveDomainForName(name) {
  const suggestions = await fetchSuggestions(name);
  if (!suggestions.length) return null;
  const ranked = suggestions
    .map(s => ({
      domain: normalizeDomain(s?.domain),
      score: scoreCandidate(name, s?.name ?? ""),
    }))
    .filter(s => s.domain)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked[0].score < 35) return null;
  return ranked[0].domain;
}

async function runWorker(queue, out, progress) {
  while (true) {
    const i = queue.nextIndex++;
    if (i >= queue.names.length) return;
    const name = queue.names[i];
    const domain = await resolveDomainForName(name);
    out[i] = { name, domain };
    progress.done++;
    if (progress.done % 100 === 0 || progress.done === queue.names.length) {
      console.log(`[domain-enrich] ${progress.done}/${queue.names.length} resolved`);
    }
    await sleep(120);
  }
}

async function main() {
  const raw = await readFile(INPUT_TXT, "utf8");
  const names = raw
    .split(/\r?\n/g)
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 1000);
  if (!names.length) {
    throw new Error(`No company names found in ${INPUT_TXT}`);
  }

  const queue = { names, nextIndex: 0 };
  const output = new Array(names.length);
  const progress = { done: 0 };
  const workers = Array.from({ length: CONCURRENCY }, () => runWorker(queue, output, progress));
  await Promise.all(workers);

  const withDomain = output.filter(r => r?.domain).length;
  const lines = [
    "name,domain,source,sourceEvidenceUrl",
    ...output.map(r =>
      [
        csvEscape(r.name),
        csvEscape(r.domain ?? ""),
        csvEscape("clearbit_autocomplete"),
        csvEscape("https://autocomplete.clearbit.com/v1/companies/suggest"),
      ].join(","),
    ),
  ];
  await writeFile(OUTPUT_CSV, `${lines.join("\n")}\n`, "utf8");
  console.log(`[domain-enrich] wrote ${OUTPUT_CSV} (${withDomain}/${names.length} with domains)`);
}

main().catch(err => {
  console.error("[domain-enrich] failed:", err);
  process.exitCode = 1;
});

