/** Serialize manual crawler ticks so two HTTP requests never overlap bounded work. */
let tail: Promise<unknown> = Promise.resolve();

export async function withProspectManualCrawlerLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(() => fn());
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
