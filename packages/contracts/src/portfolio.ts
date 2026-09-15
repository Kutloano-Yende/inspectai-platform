import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";

/**
 * Address intentionally country-neutral; South Africa first market.
 * Do not add fields beyond what the SRS/BRD require.
 */
export const Address = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  suburb: z.string().optional(),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.literal("ZA").default("ZA"),
});
export type Address = z.infer<typeof Address>;

export const PropertyType = z.enum(["RESIDENTIAL", "COMMERCIAL"]);

export const Property = z.object({
  id: Id,
  organizationId: Id,
  displayName: z.string().min(1),
  propertyType: PropertyType,
  address: Address,
  archivedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Property = z.infer<typeof Property>;

export const Unit = z.object({
  id: Id,
  propertyId: Id,
  organizationId: Id,
  label: z.string().min(1), // e.g. "Unit 4B" or the house name for single-unit properties
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  createdAt: IsoDateTime,
});
export type Unit = z.infer<typeof Unit>;
