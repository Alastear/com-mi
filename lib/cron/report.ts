/** A partially failed run must be visible to HTTP-based monitoring as a failure. */
type StageOutcome = { failed: string } | { errors: readonly string[] };
export function cronResponseStatus(report: {
  media?: StageOutcome;
  lifecycle?: StageOutcome;
}): 200 | 503 {
  return [report.media, report.lifecycle].some(
    (stage) => stage && ("failed" in stage || stage.errors.length > 0),
  ) ? 503 : 200;
}
