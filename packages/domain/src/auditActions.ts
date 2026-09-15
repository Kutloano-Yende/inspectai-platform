/** Canonical audit action codes. Append-only; never rename existing codes. */
export const AuditAction = {
  UserRegisteredOrg: "user.registered_org",
  UserLogin: "user.login",
  PropertyCreated: "property.created",
  UnitCreated: "unit.created",
  TenancyCreated: "tenancy.created",
  InvitationCreated: "invitation.created",
  InvitationRevoked: "invitation.revoked",
  InvitationAccepted: "invitation.accepted",
  InspectionCreated: "inspection.created",
  InspectionStarted: "inspection.started",
  EvidenceUploadTicketIssued: "evidence.upload_ticket_issued",
  EvidenceCommitted: "evidence.committed",
  InspectionSubmitted: "inspection.submitted",
  AnalysisRequested: "analysis.requested",
  AnalysisStarted: "analysis.started",
  AnalysisCompleted: "analysis.completed",
  AnalysisFailed: "analysis.failed",
  ReviewSubmitted: "review.submitted",
  ReportGenerated: "report.generated",
  ReportPublished: "report.published",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
