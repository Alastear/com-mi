type Environment = Readonly<Record<string, string | undefined>>;
export type ReadinessCheck = { check: string; passed: boolean };

const REQUIRED = [
  "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL", "CRON_SECRET",
  "R2_ACCOUNT_ID", "R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET", "R2_PUBLIC_BASE_URL",
  "R2_PUBLIC_ACCESS_KEY_ID", "R2_PUBLIC_SECRET_ACCESS_KEY", "R2_PRIVATE_ACCESS_KEY_ID", "R2_PRIVATE_SECRET_ACCESS_KEY",
] as const;

function url(value: string | undefined) {
  try { return value ? new URL(value) : null; } catch { return null; }
}

function databaseHost(env: Environment) {
  const parsed = url(env.DATABASE_URL);
  if (!parsed || !["postgres:", "postgresql:"].includes(parsed.protocol)) return null;
  // Neon pooled and direct URLs can point to the same branch/database.
  return parsed.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
}

/** Offline configuration checks only. No network, database writes or secret values in the result. */
export function checkBetaEnvironment(target: Environment, production?: Environment): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const add = (check: string, passed: boolean) => checks.push({ check, passed });
  for (const key of REQUIRED) add(`configured:${key}`, !!target[key]?.trim());
  add("target:explicit-non-production", ["development", "staging"].includes(target.APP_ENV ?? ""));
  add("target:noindex", target.SITE_NOINDEX === "1");
  const appUrl = url(target.NEXT_PUBLIC_APP_URL);
  const authUrl = url(target.BETTER_AUTH_URL);
  const local = appUrl && ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname);
  add("target:app-and-auth-origin", !!appUrl && !!authUrl && appUrl.origin === authUrl.origin &&
    (appUrl.protocol === "https:" || (target.APP_ENV === "development" && !!local && appUrl.protocol === "http:")));
  add("target:valid-database-url", !!databaseHost(target));
  add("target:separate-public-private-buckets", !!target.R2_PUBLIC_BUCKET && !!target.R2_PRIVATE_BUCKET && target.R2_PUBLIC_BUCKET !== target.R2_PRIVATE_BUCKET);
  add("target:separate-public-private-keys", !!target.R2_PUBLIC_ACCESS_KEY_ID && !!target.R2_PRIVATE_ACCESS_KEY_ID && target.R2_PUBLIC_ACCESS_KEY_ID !== target.R2_PRIVATE_ACCESS_KEY_ID);
  // No recipient sink exists yet. Keep outbound email disabled until REL supplies one.
  add("target:outbound-email-disabled", !target.EMAIL_FROM?.trim());
  add("baseline:explicit-production-file", production?.APP_ENV === "production");
  const targetHost = databaseHost(target), productionHost = production && databaseHost(production);
  add("isolated:database-host", !!targetHost && !!productionHost && targetHost !== productionHost);
  for (const key of ["BETTER_AUTH_SECRET", "CRON_SECRET", "R2_PUBLIC_ACCESS_KEY_ID", "R2_PRIVATE_ACCESS_KEY_ID", "R2_PUBLIC_SECRET_ACCESS_KEY", "R2_PRIVATE_SECRET_ACCESS_KEY"] as const) {
    // Check against both production storage credentials, including swapped public/private keys.
    const counterparts = key.includes("ACCESS_KEY") ? [
      production?.R2_PUBLIC_ACCESS_KEY_ID, production?.R2_PRIVATE_ACCESS_KEY_ID,
      production?.R2_PUBLIC_SECRET_ACCESS_KEY, production?.R2_PRIVATE_SECRET_ACCESS_KEY,
    ] : [production?.[key]];
    add(`isolated:${key}`, !!target[key]?.trim() && counterparts.every((value) => !!value?.trim() && value !== target[key]));
  }
  const productionBuckets = [production?.R2_PUBLIC_BUCKET, production?.R2_PRIVATE_BUCKET];
  for (const key of ["R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET"] as const) {
    add(`isolated:${key}`, !!target[key] && !!target.R2_ACCOUNT_ID && !!production?.R2_ACCOUNT_ID &&
      productionBuckets.every((bucket) => !!bucket && (target.R2_ACCOUNT_ID !== production.R2_ACCOUNT_ID || bucket !== target[key])));
  }
  const productionApp = url(production?.NEXT_PUBLIC_APP_URL);
  const publicStorage = url(target.R2_PUBLIC_BASE_URL), productionStorage = url(production?.R2_PUBLIC_BASE_URL);
  add("isolated:app-origin", !!appUrl && !!productionApp && appUrl.origin !== productionApp.origin);
  add("isolated:public-storage-origin", !!publicStorage && !!productionStorage && publicStorage.origin !== productionStorage.origin);
  return checks;
}
