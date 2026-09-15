import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";

export const Tenancy = z.object({
  id: Id,
  unitId: Id,
  organizationId: Id,
  startDate: IsoDateTime,
  endDate: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Tenancy = z.infer<typeof Tenancy>;

/**
 * Tenant invitation states. Token-scoped; no tenant account required.
 * Machine: PENDING → ACCEPTED | EXPIRED | REVOKED (terminal).
 */
export const InvitationStatus = z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);

export const TenantInvitation = z.object({
  id: Id,
  tenancyId: Id,
  organizationId: Id,
  tenantEmail: z.string().email(),
  tenantFullName: z.string().min(1),
  tenantPhone: z.string().optional(),
  status: InvitationStatus,
  expiresAt: IsoDateTime,
  acceptedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type TenantInvitation = z.infer<typeof TenantInvitation>;

/** Claim payload a tenant presents (from the emailed link). Opaque token; server resolves scope. */
export const AcceptInvitationRequest = z.object({ token: z.string().min(20) });
