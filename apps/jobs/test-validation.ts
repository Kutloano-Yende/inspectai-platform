import { AnalysisResult, Finding } from "@inspectai/contracts";

// Test case: confidence = 42 (should fail)
const testFinding = {
  id: "f1",
  checkpointId: "cp1",
  category: "WALL_DAMAGE" as const,
  severity: "LOW" as const,
  confidence: 42,  // INVALID - should be 0-1
  observation: "test",
  evidenceIds: ["e1"],
  advisory: true as const,
};

const testData = {
  analysisId: "a1",
  inspectionId: "i1",
  status: "COMPLETED" as const,
  findings: [testFinding],
  comparisons: [],
  recommendations: [],
  conditionScore: null,
  summary: "test summary",
  provenance: {
    provider: "stub",
    model: "stub-v1",
    inputSetSha256: "a".repeat(64),
    completedAt: new Date().toISOString(),
  },
};

const result = AnalysisResult.safeParse(testData);
console.log("Validation result:", {
  success: result.success,
  errors: !result.success ? result.error.issues.map(i => ({
    path: i.path.join("."),
    message: i.message,
  })) : null,
});
