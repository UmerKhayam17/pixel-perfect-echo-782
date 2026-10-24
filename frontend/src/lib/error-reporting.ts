/** Logs an error caught by an error boundary, with where it was caught. */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("[LeadFinder]", error, context);
}
