import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** User principal (authenticated) or invitation-token principal (scoped). */
export interface Principal {
  type: "user" | "invitation";
  userId?: string;
  email?: string;
  fullName?: string;
  memberships?: Array<{ organizationId: string; role: string }>;
  invitationId?: string;
  tenancyId?: string;
  organizationId?: string;
}

export interface AuthedRequest extends Request {
  principal?: Principal;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.principal) throw new Error("CurrentUser used on an unauthenticated route");
  return req.principal;
});
