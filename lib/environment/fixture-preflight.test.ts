import assert from "node:assert/strict";
import { test } from "node:test";
import { FixturePreflightError, loadFixtureEnvironment } from "./fixture-preflight";

function config(name: string) {
  return {
    APP_ENV: name === "prod" ? "production" : "staging", SITE_NOINDEX: "1",
    DATABASE_URL: `postgresql://user:fake@ep-${name}.example.test/db`,
    BETTER_AUTH_SECRET: `${name}-auth`, CRON_SECRET: `${name}-cron`,
    NEXT_PUBLIC_APP_URL: `https://${name}.example.test`, BETTER_AUTH_URL: `https://${name}.example.test`,
    R2_ACCOUNT_ID: "account", R2_PUBLIC_BUCKET: `${name}-public`, R2_PRIVATE_BUCKET: `${name}-private`,
    R2_PUBLIC_BASE_URL: `https://${name}-assets.example.test`,
    R2_PUBLIC_ACCESS_KEY_ID: `${name}-public-key`, R2_PRIVATE_ACCESS_KEY_ID: `${name}-private-key`,
    R2_PUBLIC_SECRET_ACCESS_KEY: `${name}-public-secret`, R2_PRIVATE_SECRET_ACCESS_KEY: `${name}-private-secret`,
  };
}
const args = ["--target-env", "stage", "--production-env", "prod"];
const encode = (env: Record<string, string>) => Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n");
const reader = (stage = config("stage")) => async (path: string) => encode(path === "stage" ? stage : config("prod"));

test("explicit local-test attestation uses only loopback target and disables outbound email", async () => {
  const localArgs = ["--target-env", "local", "--confirmed-local-test"];
  const local = { ...config("stage"), APP_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3450", EMAIL_FROM: "sender@example.test" };
  const loaded = await loadFixtureEnvironment(localArgs, async () => encode(local));
  assert.equal(loaded.env.EMAIL_FROM, "");
  assert.equal(loaded.env.DATABASE_URL, local.DATABASE_URL);
  for (const override of [{ APP_ENV: "production" }, { NEXT_PUBLIC_APP_URL: "https://real.example.test" }, { DATABASE_URL: "https://wrong.example.test" }]) {
    await assert.rejects(loadFixtureEnvironment(localArgs, async () => encode({ ...local, ...override })), FixturePreflightError);
  }
  await assert.rejects(loadFixtureEnvironment([...localArgs, "--production-env", "prod"], reader()), FixturePreflightError);
});

test("requires explicit files before reading any configuration", async () => {
  for (const invalid of [[], ["--target-env", "stage"], [...args, "--target-env", "other"], ["--target-env", "--production-env", "prod"]]) {
    let reads = 0;
    await assert.rejects(loadFixtureEnvironment(invalid, async () => { reads++; return ""; }), FixturePreflightError);
    assert.equal(reads, 0);
  }
});
test("passes script arguments through and loads only the target values", async () => {
  const result = await loadFixtureEnvironment(["--clean", ...args, "someone"], reader());
  assert.deepEqual(result.args, ["--clean", "someone"]);
  assert.equal(result.env.DATABASE_URL, config("stage").DATABASE_URL);
  assert.ok(Object.isFrozen(result.env));
});
test("refuses missing target values even when shell has a database URL", async () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = config("prod").DATABASE_URL;
    await assert.rejects(loadFixtureEnvironment(args, async path => path === "stage" ? "APP_ENV=staging" : encode(config("prod"))), FixturePreflightError);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
test("blocks production, pooled production host, shared buckets and outbound email", async () => {
  for (const override of [
    { APP_ENV: "production" },
    { DATABASE_URL: "postgres://other:fake@ep-prod-pooler.example.test/other" },
    { R2_PUBLIC_BUCKET: config("prod").R2_PRIVATE_BUCKET },
    { EMAIL_FROM: "someone@example.test" },
  ]) {
    let connected = false;
    await assert.rejects(async () => {
      await loadFixtureEnvironment(args, reader({ ...config("stage"), ...override }));
      connected = true;
    }, FixturePreflightError);
    assert.equal(connected, false);
  }
});
test("redacts read errors, paths and secret values", async () => {
  await assert.rejects(loadFixtureEnvironment(args, async () => { throw Error("secret-db-password /private/path"); }),
    error => error instanceof FixturePreflightError && !error.message.includes("secret-db-password") && !error.message.includes("/private/path"));
  await assert.rejects(loadFixtureEnvironment(args, reader(config("prod"))),
    error => error instanceof FixturePreflightError && !error.message.includes("postgresql://"));
});
