import { z } from "zod";
import { Id } from "./common.js";

/** BullMQ queue names + job payload contracts shared by apps/api (producer) and apps/jobs (consumer). */
export const ANALYSIS_QUEUE_NAME = "inspection-analysis";
export const REPORT_QUEUE_NAME = "inspection-report";

export const AnalysisJobPayload = z.object({ inspectionId: Id });
export type AnalysisJobPayload = z.infer<typeof AnalysisJobPayload>;

export const ReportJobPayload = z.object({
  inspectionId: Id,
  /** The authenticated human principal who requested publication (recorded in audit). */
  requestedByUserId: Id,
});
export type ReportJobPayload = z.infer<typeof ReportJobPayload>;
