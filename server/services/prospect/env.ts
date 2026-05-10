/**
 * Prospect crawler: LinkedIn/SERP-backed adapters are disabled unless explicitly enabled.
 * Unset or any value other than true/1/yes → disabled (safe default).
 */
export function prospectEnableSerpSources(): boolean {
  const v = process.env.PROSPECT_ENABLE_SERP_SOURCES?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
