import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { checkBetaEnvironment } from "../lib/environment/beta-readiness";

// Deliberately do not load process.env or merge .env.local fallbacks.
// A partial target file must fail instead of silently inheriting production resources.
const args = process.argv.slice(2);
if (args.length > 2 || args.some((arg) => arg.startsWith("-"))) {
  console.error("Usage: pnpm beta:check [target-env-file] [production-baseline-env-file]");
  process.exit(1);
}
async function readEnv(path: string) {
  try { return parseEnv(await readFile(path, "utf8")); }
  catch { return {}; } // Never print file contents, paths, connection strings or parser errors.
}
const target = await readEnv(args[0] ?? ".env.development.local");
const production = args[1] ? await readEnv(args[1]) : undefined;
const checks = checkBetaEnvironment(target, production);
for (const { check, passed } of checks) console.log(`${passed ? "PASS" : "BLOCKED"} ${check}`);
const failed = checks.filter((check) => !check.passed).length;
console.log(`Configuration checks: ${checks.length - failed}/${checks.length} passed.`);
console.log("Offline checks only. Staging restore, permissions and end-to-end flows still require verification.");
process.exitCode = failed ? 1 : 0;
