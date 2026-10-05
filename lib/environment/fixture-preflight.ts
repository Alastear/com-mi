import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { checkBetaEnvironment } from "./beta-readiness";

export class FixturePreflightError extends Error {
  constructor(public readonly checks: readonly string[]) {
    super(`Fixture preflight blocked: ${checks.join(", ")}`);
    this.name = "FixturePreflightError";
  }
}

/** Load only the two explicitly named files. Never inherit shell or dotenv defaults. */
export async function loadFixtureEnvironment(
  argv: readonly string[],
  read: (path: string) => Promise<string> = path => readFile(path, "utf8"),
) {
  const paths = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target-env" || arg === "--production-env") {
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
  if (!targetPath || !productionPath) throw new FixturePreflightError(["arguments:explicit-env-files"]);
  let target: Record<string, string | undefined>, production: Record<string, string | undefined>;
  try {
    target = parseEnv(await read(targetPath));
    production = parseEnv(await read(productionPath));
  } catch {
    // Filesystem/parser errors can contain private paths or file contents.
    throw new FixturePreflightError(["configuration:read-failed"]);
  }
  const failed = checkBetaEnvironment(target, production).filter(check => !check.passed);
  if (failed.length) throw new FixturePreflightError(failed.map(check => check.check));
  return { env: Object.freeze(target), args };
}
