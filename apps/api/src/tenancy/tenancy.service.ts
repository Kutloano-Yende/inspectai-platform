import { Inject, Injectable } from "@nestjs/common";
import { CreateInvitationRequest, CreateTenancyRequest } from "@inspectai/contracts";
import { AuditAction, assertInvitationUsable } from "@inspectai/domain";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { OrgAccessService, PORTFOLIO_ROLES } from "../org/org-access.service.js";
import { ConflictError, NotFoundError } from "../shared/errors.js";
import { generateToken, sha256 } from "../shared/crypto.js";
import type { Principal } from "../auth/principal.js";

const INVITATION_TTL_DAYS = 14;

@Injectable()
export class TenancyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OrgAccessService) private readonly org: OrgAccessService,
  ) {}

  async createTenancy(principal: Principal, unitId: string, dto: CreateTenancyRequest) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundError("Unit not found");
    this.org.assertRole(principal, unit.organizationId, PORTFOLIO_ROLES); // org from the unit row

    const row = await this.prisma.tenancy.create({
      data: {
        unitId: unit.id,
        organizationId: unit.organizationId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    await this.audit.record({
      organizationId: unit.organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.TenancyCreated,
      entityType: "Tenancy",
      entityId: row.id,
      metadata: { unitId: unit.id },
    });
    return this.mapTenancy(row);
  }

  async getTenancy(principal: Principal, id: string) {
    const row = await this.prisma.tenancy.findUnique({
      where: { id },
      include: { invitations: true },
    });
    if (!row) throw new NotFoundError("Tenancy not found");
    this.org.assertMembership(principal, row.organizationId);
    return { ...this.mapTenancy(row), invitations: row.invitations.map(mapInvitation) };
  }

  async createInvitation(principal: Principal, tenancyId: string, dto: CreateInvitationRequest) {
    const tenancy = await this.prisma.tenancy.findUnique({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundError("Tenancy not found");
    this.org.assertRole(principal, tenancy.organizationId, PORTFOLIO_ROLES); // org from the tenancy row

    const pending = await this.prisma.tenantInvitation.findFirst({
      where: { tenancyId: tenancy.id, status: "PENDING", expiresAt: { gt: new Date() } },
    });
    if (pending) {
      throw new ConflictError("INVITATION_PENDING", "This tenancy already has an active invitation; revoke it first");
    }

    // Raw token is returned exactly once; only its sha256 is stored.
    const token = generateToken();
    const row = await this.prisma.tenantInvitation.create({
      data: {
        tenancyId: tenancy.id,
        organizationId: tenancy.organizationId,
        tenantEmail: dto.tenantEmail.toLowerCase(),
        tenantFullName: dto.tenantFullName,
        ...(dto.tenantPhone ? { tenantPhone: dto.tenantPhone } : {}),
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.record({
      organizationId: tenancy.organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.InvitationCreated,
      entityType: "TenantInvitation",
      entityId: row.id,
      metadata: { tenancyId: tenancy.id, tenantEmail: row.tenantEmail },
    });
    return { invitation: mapInvitation(row), invitationToken: token };
  }

  async revokeInvitation(principal: Principal, id: string) {
    const row = await this.prisma.tenantInvitation.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Invitation not found");
    this.org.assertRole(principal, row.organizationId, PORTFOLIO_ROLES);

    if (row.status === "ACCEPTED") {
      throw new ConflictError("INVITATION_ALREADY_ACCEPTED", "An accepted invitation cannot be revoked");
    }
    if (row.status === "REVOKED") {
      throw new ConflictError("INVITATION_ALREADY_REVOKED", "Invitation is already revoked");
    }
    const updated = await this.prisma.tenantInvitation.update({
      where: { id: row.id },
      data: { status: "REVOKED" },
    });
    await this.audit.record({
      organizationId: row.organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.InvitationRevoked,
      entityType: "TenantInvitation",
      entityId: row.id,
    });
    return mapInvitation(updated);
  }

  async acceptInvitation(principal: Principal) {
    if (principal.type !== "invitation" || !principal.invitationId) {
      throw new ConflictError("INVALID_PRINCIPAL", "Invitation token required");
    }

    const row = await this.prisma.tenantInvitation.findUnique({ where: { id: principal.invitationId } });
    if (!row) throw new NotFoundError("Invitation not found");

    assertInvitationUsable(row.status as never, new Date(), row.expiresAt);

    const updated = await this.prisma.tenantInvitation.update({
      where: { id: row.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await this.audit.record({
      organizationId: row.organizationId,
      actorType: "INVITATION_TOKEN",
      action: AuditAction.InvitationAccepted,
      entityType: "TenantInvitation",
      entityId: row.id,
      metadata: { tenantEmail: row.tenantEmail },
    });
    return mapInvitation(updated);
  }

  private mapTenancy(row: any) {
    return {
      id: row.id,
      unitId: row.unitId,
      organizationId: row.organizationId,
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: row.createdAt,
    };
  }
}

export function mapInvitation(row: any) {
  return {
    id: row.id,
    tenancyId: row.tenancyId,
    organizationId: row.organizationId,
    tenantEmail: row.tenantEmail,
    tenantFullName: row.tenantFullName,
    tenantPhone: row.tenantPhone ?? undefined,
    status: row.status,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
  };
}
