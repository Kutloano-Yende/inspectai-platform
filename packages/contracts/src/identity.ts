import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";

/** Organization-scoped roles. Authorization rules live server-side; this enum is shared for display/typing only. */
export const OrganizationRole = z.enum(["OWNER", "LANDLORD", "PROPERTY_MANAGER", "ADMIN"]);
export type OrganizationRole = z.infer<typeof OrganizationRole>;

export const User = z.object({
  id: Id,
  email: z.string().email(),
  fullName: z.string().min(1),
  mfaEnabled: z.boolean(),
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

export const OrganizationMember = z.object({
  user: User,
  role: OrganizationRole,
  memberSince: IsoDateTime,
});
export type OrganizationMember = z.infer<typeof OrganizationMember>;
