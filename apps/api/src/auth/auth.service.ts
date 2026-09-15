import { Inject, Injectable } from "@nestjs/common";
import { RegisterRequest, LoginRequest } from "@inspectai/contracts";
import { AuditAction } from "@inspectai/domain";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { generateToken, hashPassword, sha256, verifyPassword } from "../shared/crypto.js";
import { ConflictError, UnauthorizedError } from "../shared/errors.js";
import { SESSION_TTL_DAYS } from "./auth.guard.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Creates the organization, its OWNER user and a session in one transaction. */
  async register(dto: RegisterRequest) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictError("EMAIL_ALREADY_REGISTERED", "An account with this email already exists");

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: dto.organizationName } });
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: hashPassword(dto.password),
          fullName: dto.fullName,
        },
      });
      await tx.organizationMembership.create({
        data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
      });
      const session = await this.createSession(tx, user.id);
      return { organization, user, sessionToken: session };
    });

    // Audit after transaction commits — organization and user now exist
    await this.audit.record({
      organizationId: result.organization.id,
      actorType: "USER",
      actorUserId: result.user.id,
      action: AuditAction.UserRegisteredOrg,
      entityType: "Organization",
      entityId: result.organization.id,
    });

    return {
      user: { id: result.user.id, email: result.user.email, fullName: result.user.fullName, mfaEnabled: false, createdAt: result.user.createdAt },
      organization: { id: result.organization.id, name: result.organization.name, createdAt: result.organization.createdAt },
    };
  }

  /** Issues a session for a user created inside register() (cookie set by controller). */
  async issueSessionForNewOrganization(userId: string): Promise<string> {
    return this.createSession(this.prisma, userId);
  }

  async login(dto: LoginRequest) {    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Same generic error for unknown email and wrong password.
    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    const token = await this.createSession(this.prisma, user.id);
    await this.audit.record({
      actorType: "USER",
      actorUserId: user.id,
      action: AuditAction.UserLogin,
      entityType: "User",
      entityId: user.id,
    });
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, mfaEnabled: false, createdAt: user.createdAt },
      sessionToken: token,
    };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  async me(principal: { userId: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, mfaEnabled: false, createdAt: user.createdAt },
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        role: m.role,
        memberSince: m.createdAt,
      })),
    };
  }

  private async createSession(tx: Pick<PrismaService, "session">, userId: string): Promise<string> {
    const token = generateToken();
    await tx.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }
}
