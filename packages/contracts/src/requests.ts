import { z } from "zod";
import { Address, PropertyType } from "./portfolio.js";
import { IsoDateTime } from "./common.js";

/* Auth requests */
export const RegisterRequest = z.object({
  organizationName: z.string().min(1).max(200),
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(10).max(200),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/* Portfolio requests */
export const CreatePropertyRequest = z.object({
  displayName: z.string().min(1).max(200),
  propertyType: PropertyType.default("RESIDENTIAL"),
  address: Address,
});
export type CreatePropertyRequest = z.infer<typeof CreatePropertyRequest>;

export const CreateUnitRequest = z.object({
  label: z.string().min(1).max(120),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
});
export type CreateUnitRequest = z.infer<typeof CreateUnitRequest>;

/* Tenancy requests */
export const CreateTenancyRequest = z.object({
  startDate: IsoDateTime,
  endDate: IsoDateTime.nullable().optional(),
});
export type CreateTenancyRequest = z.infer<typeof CreateTenancyRequest>;

export const CreateInvitationRequest = z.object({
  tenantEmail: z.string().email(),
  tenantFullName: z.string().min(1).max(200),
  tenantPhone: z.string().min(1).max(40).optional(),
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequest>;

/* Inspection requests */
import { InspectionType } from "./inspection.js";

export const CreateInspectionRequest = z.object({
  type: InspectionType,
});
export type CreateInspectionRequest = z.infer<typeof CreateInspectionRequest>;
