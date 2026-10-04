import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkBetaEnvironment } from "./beta-readiness";

function environment(name: string) {
  return {
    APP_ENV: name === "prod" ? "production" : "staging", SITE_NOINDEX: "1",
    DATABASE_URL: `postgresql://user:fake@ep-${name}-pooler.example.test/db`,
    BETTER_AUTH_SECRET: `${name}-auth`, CRON_SECRET: `${name}-cron`,
    NEXT_PUBLIC_APP_URL: `https://${name}.example.test`, BETTER_AUTH_URL: `https://${name}.example.test`,
    R2_ACCOUNT_ID: "shared-account", R2_PUBLIC_BUCKET: `${name}-public`, R2_PRIVATE_BUCKET: `${name}-private`,
    R2_PUBLIC_BASE_URL: `https://${name}-assets.example.test`,
    R2_PUBLIC_ACCESS_KEY_ID: `${name}-public-key`, R2_PRIVATE_ACCESS_KEY_ID: `${name}-private-key`,
    R2_PUBLIC_SECRET_ACCESS_KEY: `${name}-public-secret`, R2_PRIVATE_SECRET_ACCESS_KEY: `${name}-private-secret`,
  };
}
const target = environment("stage"), production = environment("prod");
const failed = (env = target, baseline: Record<string, string> | undefined = production) => checkBetaEnvironment(env, baseline).filter((check) => !check.passed).map((check) => check.check);

describe("offline staging preflight", () => {
  it("accepts a complete separated configuration without probing resources", () => assert.deepEqual(failed(), []));
  it("does not treat noindex or a missing production baseline as proof of isolation", () => {
    assert.ok(failed({ ...target, APP_ENV: "" }).includes("target:explicit-non-production"));
    assert.ok(checkBetaEnvironment(target).some((check) => !check.passed && check.check === "isolated:database-host"));
    assert.ok(failed(target, { ...production, APP_ENV: "" }).includes("baseline:explicit-production-file"));
  });
  it("recognizes pooled/direct URLs and alternate credentials as the same database host", () => {
    assert.ok(failed({ ...target, DATABASE_URL: "postgres://other:fake@ep-prod.example.test/other" }).includes("isolated:database-host"));
    assert.ok(failed({ ...target, DATABASE_URL: "not a url" }).includes("target:valid-database-url"));
  });
  it("catches swapped production buckets and storage credentials", () => {
    const failures = failed({ ...target, R2_PUBLIC_BUCKET: production.R2_PRIVATE_BUCKET, R2_PUBLIC_ACCESS_KEY_ID: production.R2_PRIVATE_ACCESS_KEY_ID, BETTER_AUTH_SECRET: production.BETTER_AUTH_SECRET });
    for (const key of ["R2_PUBLIC_BUCKET", "R2_PUBLIC_ACCESS_KEY_ID", "BETTER_AUTH_SECRET"]) assert.ok(failures.includes(`isolated:${key}`));
  });
  it("requires noindex, matching auth origin and outbound email disabled", () => {
    const checks = checkBetaEnvironment({ ...target, SITE_NOINDEX: "0", BETTER_AUTH_URL: production.BETTER_AUTH_URL, EMAIL_FROM: "test@example.test" }, production);
    for (const key of ["noindex", "app-and-auth-origin", "outbound-email-disabled"]) assert.ok(checks.some((check) => !check.passed && check.check === `target:${key}`));
  });
  it("allows localhost development but requires HTTPS on staging", () => {
    const local = { ...target, APP_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3450", BETTER_AUTH_URL: "http://localhost:3450" };
    assert.deepEqual(failed(local), []);
    assert.ok(failed({ ...local, APP_ENV: "staging" }).includes("target:app-and-auth-origin"));
  });
  it("never returns secret values or connection strings", () => {
    const result = JSON.stringify(checkBetaEnvironment(target, production));
    for (const value of Object.values(target).filter((value) => value.length > 12)) assert.equal(result.includes(value), false);
  });
});
