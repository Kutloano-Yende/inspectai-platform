import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service.js";
import { UnauthorizedError } from "../shared/errors.js";
import { sha256 } from "../shared/crypto.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import type { AuthedRequest } from "./principal.js";

export const SESSION_COOKIE = "inspectai_session";
export const SESSION_TTL_DAYS = 30;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    // Try invitation token first (query param or Authorization header)
    const invitationToken = req.query.token as string | undefined || this.extractBearerToken(req);
    if (invitationToken) {
      const invitation = await this.prisma.tenantInvitation.findUnique({
        where: { tokenHash: sha256(invitationToken) },
      });
      if (invitation && invitation.status === "PENDING" && invitation.expiresAt > new Date()) {
        req.principal = {
          type: "invitation",
          invitationId: invitation.id,
          tenancyId: invitation.tenancyId,
          organizationId: invitation.organizationId,
          email: invitation.tenantEmail,
          fullName: invitation.tenantFullName,
        };
        return true;
      }
    }

    // Fall back to user session
    const sessionToken = readCookie(req as unknown as Request, SESSION_COOKIE);
    if (!sessionToken) throw new UnauthorizedError();

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(sessionToken) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedError("SESSION_INVALID", "Session expired or invalid");

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: session.userId },
      select: { organizationId: true, role: true },
    });

    req.principal = {
      type: "user",
      userId: session.userId,
      email: session.user.email,
      fullName: session.user.fullName,
      memberships,
    };
    return true;
  }

  private extractBearerToken(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return undefined;
    return auth.slice(7);
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
