import { AnalysisJobPayload, ReportJobPayload } from "@inspectai/contracts";

/** Queue payloads are validated with the shared contracts before use. */
export function parseAnalysisPayload(raw: unknown): AnalysisJobPayload {
  return AnalysisJobPayload.parse(raw);
}

export function parseReportPayload(raw: unknown): ReportJobPayload {
  return ReportJobPayload.parse(raw);
}
