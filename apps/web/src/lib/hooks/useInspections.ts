"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fetchApi } from "../api";

export interface Inspection {
  id: string;
  type: string;
  status: string;
  tenancy: { id: string } | null;
  property: { id: string; address: string } | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  analysisStatus: string;
}

export interface InspectionsResponse {
  data: Inspection[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface InspectionDetail {
  id: string;
  tenancyId: string;
  organizationId: string;
  type: string;
  status: string;
  property: { id: string; address: string } | null;
  plan: {
    rooms: Array<{
      roomCategory: string;
      label: string;
      checkpoints: Array<{
        id: string;
        roomCategory: string;
        prompt: string;
        mandatory: boolean;
        position: number;
      }>;
    }>;
  };
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  evidence: Array<{
    id: string;
    inspectionId: string;
    checkpointId: string;
    kind: "PHOTO" | "VIDEO";
    storageKey: string;
    contentSha256: string;
    bytes: number;
    capturedAt: string;
    gps: { latitude: number; longitude: number; accuracyM: number } | null;
    verification: {
      freshnessVerified: boolean;
      duplicateDetected: boolean;
      qualityAcceptable: boolean;
      notes: string[];
    };
    committedAt: string | null;
    downloadUrl: string;
    expiresAt: string;
  }>;
  analysis: {
    id: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    summary: string;
    conditionScore?: number;
    provenance?: object;
    findings: Array<{
      id: string;
      checkpointId: string | null;
      roomLabel?: string;
      category: string;
      severity: string;
      confidence: number;
      observation: string;
      evidenceIds: string[];
      advisory: boolean;
      decision: "ACCEPTED" | "AMENDED" | "REJECTED" | null;
      amendedObservation?: string;
      landlordNote?: string;
    }>;
  } | null;
  review: {
    reviewedAt: string;
    overallNote?: string;
    findingReviews: Array<{
      findingId: string;
      decision: "ACCEPTED" | "AMENDED" | "REJECTED";
      amendedObservation?: string;
      landlordNote?: string;
    }>;
  } | null;
  reports: Array<{
    id: string;
    version: number;
    publishedAt: string;
  }>;
}

export function useInspections(opts?: { status?: string | undefined; limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const status = opts?.status ?? "";

  return useQuery<InspectionsResponse>({
    queryKey: ["inspections", status, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      params.append("limit", String(limit));
      params.append("offset", String(offset));
      return fetchApi<InspectionsResponse>(`/inspections?${params}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useInspection(id: string) {
  return useQuery<InspectionDetail>({
    queryKey: ["inspection", id],
    queryFn: () => fetchApi<InspectionDetail>(`/inspections/${id}`),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

const FindingReviewSchema = z.object({
  findingId: z.string(),
  decision: z.enum(["ACCEPTED", "AMENDED", "REJECTED"]),
  amendedObservation: z.string().min(1).optional(),
  landlordNote: z.string().optional(),
});

const SubmitReviewRequestSchema = z.object({
  findingReviews: z.array(FindingReviewSchema).min(1),
  overallNote: z.string().optional(),
}).superRefine((data, ctx) => {
  for (const [i, fr] of data.findingReviews.entries()) {
    if (fr.decision === "AMENDED" && !fr.amendedObservation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["findingReviews", i, "amendedObservation"],
        message: "amendedObservation is required when decision is AMENDED",
      });
    }
  }
});

type SubmitReviewRequest = z.infer<typeof SubmitReviewRequestSchema>;

export function useRequestAnalysis(inspectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return fetchApi<{ id: string; status: string }>(`/inspections/${inspectionId}/analyze`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
  });
}

export function useSubmitReview(inspectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SubmitReviewRequest) => {
      const validated = SubmitReviewRequestSchema.parse(data);
      return fetchApi<{ ok: boolean }>(`/inspections/${inspectionId}/review`, {
        method: "POST",
        body: JSON.stringify(validated),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
  });
}

export function useRequestReport(inspectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return fetchApi<{ queued: boolean; inspectionId: string }>(`/inspections/${inspectionId}/report`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
  });
}

export function useDownloadReport(reportId: string) {
  return useMutation({
    mutationFn: async () => {
      return fetchApi<{ url: string; expiresAt: string }>(`/reports/${reportId}/download`, {
        method: "GET",
      });
    },
  });
}
