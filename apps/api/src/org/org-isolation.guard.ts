import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { ForbiddenError } from "../shared/errors.js";
import type { AuthedRequest } from "../auth/principal.js";

/** Global guard: every resource request resolves organizationId and verifies principal membership. */
@Injectable()
export class OrgIsolationGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;

    if (!principal) {
      throw new ForbiddenError("NOT_AUTHENTICATED", "Principal required");
    }

    if (principal.type === "user") {
      const { organizationId } = this.extractOrgIdFromRoute(ctx);
      if (organizationId && principal.memberships) {
        const hasMembership = principal.memberships.some((m) => m.organizationId === organizationId);
        if (!hasMembership) throw new ForbiddenError("ORG_ACCESS_DENIED", "Not a member of this organization");
      }
    } else if (principal.type === "invitation") {
      const { organizationId } = this.extractOrgIdFromRoute(ctx);
      if (organizationId && principal.organizationId !== organizationId) {
        throw new ForbiddenError("ORG_ACCESS_DENIED", "Invitation not valid for this organization");
      }
    }

    return true;
  }

  private extractOrgIdFromRoute(ctx: ExecutionContext): { organizationId?: string } {
    const req = ctx.switchToHttp().getRequest();
    const params = req.params || {};

    if (params.organizationId) return { organizationId: params.organizationId };
    return {};
  }
}
