import { Injectable } from "@nestjs/common";
import { OrganizationRole } from "@inspectai/contracts";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";
import type { Principal } from "../auth/principal.js";

/**
 * Server-side organization scope resolution + role authorization.
 * organizationId supplied by clients is never trusted: nested resources derive
 * their org from their parent row; top-level creates resolve from membership.
 */
@Injectable()
export class OrgAccessService {
  /** Role of the principal in the given org; throws if not a member. */
  assertMembership(principal: Principal, organizationId: string): string {
    if (principal.type === "invitation") {
      if (principal.organizationId !== organizationId) throw new NotFoundError();
      return "TENANT"; // Invitation-scoped tenants have implicit role
    }
    const membership = principal.memberships?.find((m) => m.organizationId === organizationId);
    if (!membership) throw new NotFoundError(); // non-members learn nothing about the org's resources
    return membership.role;
  }

  /** Role check against the contracts role enum. */
  assertRole(principal: Principal, organizationId: string, allowed: readonly string[]): string {
    const role = this.assertMembership(principal, organizationId);
    if (!allowed.includes(role)) {
      throw new ForbiddenError("ROLE_NOT_PERMITTED", `Principal role ${role} not allowed for this action`);
    }
    return role;
  }

  /**
   * Resolve the organization for a top-level create: explicit organizationId must
   * be one the principal belongs to; otherwise the principal's single membership.
   */
  resolveOrgId(principal: Principal, requested?: string): string {
    if (requested) {
      this.assertMembership(principal, requested);
      return requested;
    }
    if (principal.memberships.length === 1) return principal.memberships[0]!.organizationId;
    if (principal.memberships.length === 0) throw new ForbiddenError("NO_ORGANIZATION", "Principal belongs to no organization");
    throw new ForbiddenError("ORGANIZATION_AMBIGUOUS", "organizationId is required for principals with multiple organizations");
  }
}

/** All Phase 1 portfolio-management roles (SRS §6.2–6.3). */
export const PORTFOLIO_ROLES: readonly string[] = OrganizationRole.options;
