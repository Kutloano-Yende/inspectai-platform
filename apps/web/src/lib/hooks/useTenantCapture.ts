"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateEvidenceUploadRequest, EvidenceUploadTicket, Evidence } from "@inspectai/contracts";
import { API_URL, ApiError } from "../api";
import type { InspectionDetail } from "./useInspections";

/** Token-scoped fetch: the invitation token travels as a bearer header, never in the URL. */
async function tenantFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const body = JSON.parse(text) as { detail?: string; title?: string; code?: string };
      message = body.detail || body.title || message;
      code = body.code;
    } catch {
      // not JSON; use raw text
    }
    throw new ApiError(response.status, message, code);
  }
  return response.json();
}

export interface MyInvitationResponse {
  invitation: {
    id: string;
    tenantFullName: string;
    tenantEmail: string;
    status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
    expiresAt: string;
  };
  property: { displayName: string };
  inspection: { id: string; status: string } | null;
}

export function useMyInvitation(token: string) {
  return useQuery<MyInvitationResponse>({
    queryKey: ["invitation", "me", token],
    queryFn: () => tenantFetch<MyInvitationResponse>(token, "/invitations/me"),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      tenantFetch<{ invitation: unknown; inspection: { id: string; status: string } }>(
        token,
        "/invitations/accept",
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitation", "me", token] });
    },
  });
}

export function useTenantInspection(token: string, inspectionId: string | undefined) {
  return useQuery<InspectionDetail>({
    queryKey: ["tenant-inspection", inspectionId],
    queryFn: () => tenantFetch<InspectionDetail>(token, `/inspections/${inspectionId}`),
    enabled: !!token && !!inspectionId,
  });
}

export function useCreateEvidenceTicket(token: string, inspectionId: string) {
  return useMutation({
    mutationFn: (dto: CreateEvidenceUploadRequest) =>
      tenantFetch<EvidenceUploadTicket & { evidenceId: string }>(token, `/inspections/${inspectionId}/evidence`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
  });
}

export function useCommitEvidence(token: string, inspectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { evidenceId: string; captureNonce: string }) =>
      tenantFetch<Evidence>(token, `/evidence/${dto.evidenceId}/commit`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-inspection", inspectionId] });
    },
  });
}

export function useSubmitTenantInspection(token: string, inspectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      tenantFetch<{ id: string; status: string }>(token, `/inspections/${inspectionId}/submit`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-inspection", inspectionId] });
    },
  });
}

/** Uploads the raw file bytes directly to storage via the pre-signed PUT URL. */
export async function putEvidenceFile(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Best-effort GPS read; the server never requires it (FR-007 freshness/quality are server-guaranteed). */
export function readGeolocation(timeoutMs = 4000): Promise<{ latitude: number; longitude: number; accuracyM: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
