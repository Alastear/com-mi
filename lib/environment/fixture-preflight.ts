import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { checkBetaEnvironment } from "./beta-readiness";

export class FixturePreflightError extends Error {
  constructor(public readonly checks: readonly string[]) {
    super(`Fixture preflight blocked: ${checks.join(", ")}`);
    this.name = "FixturePreflightError";
  }
}

/** Load only explicitly named files. Never inherit shell or dotenv defaults. */
export async function loadFixtureEnvironment(
  argv: readonly string[],
  read: (path: string) => Promise<string> = path => readFile(path, "utf8"),
): Promise<{ env: Readonly<Record<string, string | undefined>>; args: string[] }> {
  const paths = new Map<string, string>();
  const args: string[] = [];
  let confirmedLocal = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--confirmed-local-test") {
      if (confirmedLocal) throw new FixturePreflightError(["arguments:duplicate-local-confirmation"]);
      confirmedLocal = true;
    } else if (arg === "--target-env" || arg === "--production-env") {
      const value = argv[++i];
      if (!value || value.startsWith("--") || paths.has(arg)) {
        throw new FixturePreflightError(["arguments:explicit-env-files"]);
      }
      paths.set(arg, value);
    } else {
      args.push(arg);
    }
  }
  const targetPath = paths.get("--target-env");
  const productionPath = paths.get("--production-env");
  if (!targetPath || (!productionPath && !confirmedLocal) || (productionPath && confirmedLocal)) throw new FixturePreflightError(["arguments:explicit-env-files"]);
  let target: Record<string, string | undefined>, production: Record<string, string | undefined>;
  try {
    target = parseEnv(await read(targetPath));
    production = productionPath ? parseEnv(await read(productionPath)) : {};
  } catch {
    // Filesystem/parser errors can contain private paths or file contents.
    throw new FixturePreflightError(["configuration:read-failed"]);
  }
  // Explicit operator attestation for a DB-only local test run. This is not staging isolation certification.
  if (confirmedLocal) {
    let valid = false;
    try {
      const app = new URL(target.NEXT_PUBLIC_APP_URL ?? "");
      const database = new URL(target.DATABASE_URL ?? "");
      valid = [undefined, "development"].includes(target.APP_ENV) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname) &&
        ["http:", "https:"].includes(app.protocol) && ["postgres:", "postgresql:"].includes(database.protocol);
    } catch { /* Fail closed; do not expose URL values. */ }
    if (!valid) throw new FixturePreflightError(["target:confirmed-local-test-only"]);
    return { env: Object.freeze({ ...target, EMAIL_FROM: "", RESEND_API_KEY: "" }), args };
  }
  const failed = checkBetaEnvironment(target, production).filter(check => !check.passed);
  if (failed.length) throw new FixturePreflightError(failed.map(check => check.check));
  return { env: Object.freeze(target), args };
}
