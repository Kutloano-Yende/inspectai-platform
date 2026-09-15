"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "../api";
import type { Property, Unit, Tenancy, CreatePropertyRequest, CreateUnitRequest, CreateTenancyRequest, CreateInvitationRequest } from "@inspectai/contracts";

export function useProperties() {
  return useQuery({
    queryKey: ["properties"],
    queryFn: () => fetchApi<Property[]>("/properties"),
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ["property", id],
    queryFn: () =>
      fetchApi<Property & { units: Unit[] }>(`/properties/${id}`),
    enabled: !!id,
  });
}

export function useCreateProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePropertyRequest) =>
      fetchApi<Property>("/properties", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
    },
  });
}

export function useCreateUnit(propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUnitRequest) =>
      fetchApi<Unit>(`/properties/${propertyId}/units`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    },
  });
}

export function useTenancy(id: string) {
  return useQuery({
    queryKey: ["tenancy", id],
    queryFn: () =>
      fetchApi<Tenancy & { invitations: any[] }>(`/tenancies/${id}`),
    enabled: !!id,
  });
}

export function useCreateTenancy(unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTenancyRequest) =>
      fetchApi<Tenancy>(`/units/${unitId}/tenancies`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["property"] });
      queryClient.setQueryData(["tenancy", data.id], data);
    },
  });
}

export function useCreateInvitation(tenancyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateInvitationRequest) =>
      fetchApi<{ invitation: any; invitationToken: string }>(
        `/tenancies/${tenancyId}/invitations`,
        {
          method: "POST",
          body: JSON.stringify(dto),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenancy", tenancyId] });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      fetchApi(`/invitations/${invitationId}/revoke`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenancy"] });
    },
  });
}
