import { AnalysisResult, Id } from "@inspectai/contracts";

const candidate = {
  analysisId: Id.parse("test-id"),
  inspectionId: Id.parse("test-insp"),
  status: "COMPLETED" as const,
  findings: [{
    id: Id.parse("test-finding-1"),
    checkpointId: Id.parse("test-cp"),
    category: "GENERAL_WEAR" as const,
    severity: "LOW" as const,
    confidence: 42,
    observation: "test observation",
    evidenceIds: [Id.parse("test-evidence-1")],
    advisory: true as const,
  }],
  comparisons: [],
  recommendations: [],
  conditionScore: null,
  summary: "test summary",
  provenance: {
    provider: "test",
    model: "test-v1",
    inputSetSha256: "a".repeat(64),
    completedAt: new Date().toISOString(),
  },
};

console.log("Testing confidence: 42");
const result = AnalysisResult.safeParse(candidate);
console.log("Success:", result.success);
if (!result.success) {
  console.log("Errors:", JSON.stringify(result.error.issues, null, 2));
}
