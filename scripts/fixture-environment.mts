import { FixturePreflightError, loadFixtureEnvironment } from "../lib/environment/fixture-preflight";

/** Call before constructing any database/storage client, including cleanup commands. */
export async function requireFixtureEnvironment() {
  try {
    return await loadFixtureEnvironment(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof FixturePreflightError ? error.message : "Fixture preflight failed.");
    console.error("Required: --target-env .env.staging.local --production-env .env.production.audit.local");
    process.exit(1);
  }
}
