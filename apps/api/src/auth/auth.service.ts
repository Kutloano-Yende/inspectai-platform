import { Inject, Injectable } from "@nestjs/common";
import { RegisterRequest, LoginRequest, CompleteOrganizationRequest } from "@inspectai/contracts";
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
    // Same generic error for unknown email, OAuth-only accounts (no password set) and wrong password.
    if (!user || !user.passwordHash || !verifyPassword(dto.password, user.passwordHash)) {
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

  /** Signs in a user via a verified Google identity, linking or creating an account as needed. */
  async loginOrRegisterWithGoogle(profile: { googleId: string; email: string; fullName: string }) {
    return this.loginOrRegisterWithOAuth({
      field: "googleId",
      providerId: profile.googleId,
      email: profile.email,
      fullName: profile.fullName,
    });
  }

  /** Signs in a user via a verified Apple identity, linking or creating an account as needed. */
  async loginOrRegisterWithApple(profile: { appleId: string; email: string; fullName: string }) {
    return this.loginOrRegisterWithOAuth({
      field: "appleId",
      providerId: profile.appleId,
      email: profile.email,
      fullName: profile.fullName,
    });
  }

  /**
   * Signs in a user via a Microsoft identity, linking or creating an account as needed.
   * Microsoft's `email` claim is NOT a verified-email guarantee (Microsoft's own docs: "not
   * guaranteed to be correct... never use it for authorization"), unlike Google/Apple's explicit
   * email_verified. So unlike those two, this never auto-links to an existing account by email —
   * doing so would let anyone with a Microsoft account matching someone else's email take over
   * that account. A genuine owner can still link Microsoft manually once signed in normally.
   */
  async loginOrRegisterWithMicrosoft(profile: { microsoftId: string; email: string; fullName: string }) {
    return this.loginOrRegisterWithOAuth({
      field: "microsoftId",
      providerId: profile.microsoftId,
      email: profile.email,
      fullName: profile.fullName,
      linkByEmail: false,
    });
  }

  /**
   * Shared behind Google/Apple/Microsoft sign-in:
   * - Existing account with this provider id -> sign in.
   * - linkByEmail && existing email (password or other-provider account) -> link this provider
   *   id, then sign in.
   * - Neither -> create just the user (no organization yet — email sign-up asks for a real
   *   organization name up front; OAuth has no such step, so rather than invent one like
   *   "{name}'s Organization" with no way to fix it, the account is created org-less and the
   *   caller sends them to complete onboarding via completeOrganization() below). If
   *   linkByEmail is false and the email is already taken, this refuses rather than silently
   *   creating a duplicate or linking to an account it can't confirm ownership of.
   */
  private async loginOrRegisterWithOAuth(params: {
    field: "googleId" | "appleId" | "microsoftId";
    providerId: string;
    email: string;
    fullName: string;
    linkByEmail?: boolean;
  }) {
    const email = params.email.toLowerCase();
    const linkByEmail = params.linkByEmail ?? true;

    const byProviderId = await this.findByProviderId(params.field, params.providerId);
    if (byProviderId) {
      const token = await this.createSession(this.prisma, byProviderId.id);
      return { userId: byProviderId.id, sessionToken: token, isNewAccount: false, needsOrganization: false };
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (!linkByEmail) {
        throw new ConflictError("EMAIL_ALREADY_REGISTERED", "An account with this email already exists");
      }
      await this.linkProviderId(params.field, byEmail.id, params.providerId);
      const token = await this.createSession(this.prisma, byEmail.id);
      return { userId: byEmail.id, sessionToken: token, isNewAccount: false, needsOrganization: false };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: params.fullName,
          ...(params.field === "googleId" && { googleId: params.providerId }),
          ...(params.field === "appleId" && { appleId: params.providerId }),
          ...(params.field === "microsoftId" && { microsoftId: params.providerId }),
        },
      });
      const session = await this.createSession(tx, user.id);
      return { user, sessionToken: session };
    });

    return { userId: result.user.id, sessionToken: result.sessionToken, isNewAccount: true, needsOrganization: true };
  }

  /**
   * Names the organization for a user created without one (OAuth sign-up — see
   * loginOrRegisterWithOAuth). Refuses if the user already belongs to an organization, so this
   * can't be used to create extra organizations for an already-provisioned account.
   */
  async completeOrganization(userId: string, dto: CompleteOrganizationRequest) {
    const existingMembership = await this.prisma.organizationMembership.findFirst({ where: { userId } });
    if (existingMembership) {
      throw new ConflictError("ORGANIZATION_ALREADY_EXISTS", "You already belong to an organization");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: dto.organizationName } });
      await tx.organizationMembership.create({
        data: { userId, organizationId: organization.id, role: "OWNER" },
      });
      return organization;
    });

    await this.audit.record({
      organizationId: result.id,
      actorType: "USER",
      actorUserId: userId,
      action: AuditAction.UserRegisteredOrg,
      entityType: "Organization",
      entityId: result.id,
    });

    return { organization: { id: result.id, name: result.name, createdAt: result.createdAt } };
  }

  /** Resolves a raw session cookie value to a userId, or undefined if it's missing/invalid/expired. Never throws. */
  async resolveSessionUserId(token: string): Promise<string | undefined> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
    if (!session || session.expiresAt <= new Date()) return undefined;
    return session.userId;
  }

  /**
   * Links a verified provider identity to an already-authenticated user (Settings > "Link
   * Google/Apple/Microsoft"), unlike loginOrRegisterWithOAuth which signs in or creates an
   * account. Unlike sign-in, this never requires an email match — the whole point of linking a
   * second provider is often a different email — but it does refuse if that provider identity is
   * already claimed by a DIFFERENT user, so linking can't be used to steal a login method that
   * belongs to someone else's account. Linking a provider already linked to this same user is a
   * harmless no-op.
   */
  async linkProviderForUser(userId: string, field: "googleId" | "appleId" | "microsoftId", providerId: string): Promise<void> {
    const existingOwner = await this.findByProviderId(field, providerId);
    if (existingOwner && existingOwner.id !== userId) {
      throw new ConflictError("PROVIDER_ALREADY_LINKED", "This account is already linked to a different InspectAI user");
    }
    if (existingOwner) return;
    await this.linkProviderId(field, userId, providerId);
  }

  /** Removes a linked provider, refusing if it would leave the user with no way to sign in at all. */
  async unlinkProvider(userId: string, field: "googleId" | "appleId" | "microsoftId"): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const authMethodCount = [user.passwordHash, user.googleId, user.appleId, user.microsoftId].filter(Boolean).length;
    if (authMethodCount <= 1) {
      throw new ConflictError("LAST_AUTH_METHOD", "You must keep at least one way to sign in — add another before removing this one");
    }
    if (field === "googleId") {
      await this.prisma.user.update({ where: { id: userId }, data: { googleId: null } });
    } else if (field === "appleId") {
      await this.prisma.user.update({ where: { id: userId }, data: { appleId: null } });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { microsoftId: null } });
    }
  }

  private async findByProviderId(field: "googleId" | "appleId" | "microsoftId", value: string) {
    if (field === "googleId") return this.prisma.user.findUnique({ where: { googleId: value } });
    if (field === "appleId") return this.prisma.user.findUnique({ where: { appleId: value } });
    return this.prisma.user.findUnique({ where: { microsoftId: value } });
  }

  private async linkProviderId(field: "googleId" | "appleId" | "microsoftId", userId: string, value: string): Promise<void> {
    if (field === "googleId") {
      await this.prisma.user.update({ where: { id: userId }, data: { googleId: value } });
    } else if (field === "appleId") {
      await this.prisma.user.update({ where: { id: userId }, data: { appleId: value } });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { microsoftId: value } });
    }
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
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        mfaEnabled: false,
        createdAt: user.createdAt,
        hasPassword: user.passwordHash !== null,
        googleLinked: user.googleId !== null,
        appleLinked: user.appleId !== null,
        microsoftLinked: user.microsoftId !== null,
      },
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
