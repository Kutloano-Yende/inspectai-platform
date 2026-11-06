import { Inject, Injectable } from "@nestjs/common";
import { CreateInvitationRequest, CreateTenancyRequest } from "@inspectai/contracts";
import { AuditAction, InvalidTransitionError, assertInvitationUsable, assertTransition, InvitationNotUsableError } from "@inspectai/domain";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { OrgAccessService, PORTFOLIO_ROLES } from "../org/org-access.service.js";
import { ConflictError, NotFoundError } from "../shared/errors.js";
import { generateToken, sha256 } from "../shared/crypto.js";
import type { Principal } from "../auth/principal.js";
import { mapInspection } from "../inspection/inspection.service.js";

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
      include: { invitations: true, inspections: { orderBy: { createdAt: "desc" } } },
    });
    if (!row) throw new NotFoundError("Tenancy not found");
    this.org.assertMembership(principal, row.organizationId);
    return {
      ...this.mapTenancy(row),
      invitations: row.invitations.map(mapInvitation),
      inspections: row.inspections.map(mapInspection),
    };
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

  /**
   * Accepting the invitation is what starts the inspection: in one step it moves the
   * tenancy's draft inspection DRAFT -> INVITED -> IN_PROGRESS, the only code path that
   * ever does so. Requires a DRAFT inspection to already exist (the landlord creates it).
   */
  async acceptInvitation(principal: Principal) {
    if (principal.type !== "invitation" || !principal.invitationId) {
      throw new ConflictError("INVALID_PRINCIPAL", "Invitation token required");
    }

    const row = await this.prisma.tenantInvitation.findUnique({ where: { id: principal.invitationId } });
    if (!row) throw new NotFoundError("Invitation not found");

    try {
      assertInvitationUsable(row.status as never, new Date(), row.expiresAt);
    } catch (err) {
      if (err instanceof InvitationNotUsableError) {
        if (row.status === "ACCEPTED") throw new ConflictError("INVITATION_ALREADY_ACCEPTED", "Invitation already accepted");
        if (row.status === "REVOKED") throw new ConflictError("INVITATION_REVOKED", "Invitation has been revoked");
        throw new ConflictError("INVITATION_EXPIRED", "Invitation has expired");
      }
      throw err;
    }

    const draftInspection = await this.prisma.inspection.findFirst({
      where: { tenancyId: row.tenancyId, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
    });
    if (!draftInspection) {
      throw new ConflictError("NO_DRAFT_INSPECTION", "No inspection is ready for this tenancy yet");
    }

    try {
      assertTransition(draftInspection.status as never, "INVITED");
      assertTransition("INVITED" as never, "IN_PROGRESS");
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictError("INVALID_STATE", `Cannot start inspection in ${draftInspection.status} state`);
      }
      throw err;
    }

    const [updatedInvitation, updatedInspection] = await this.prisma.$transaction([
      this.prisma.tenantInvitation.update({
        where: { id: row.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      }),
      this.prisma.inspection.update({
        where: { id: draftInspection.id },
        data: { status: "IN_PROGRESS", invitationId: row.id },
      }),
    ]);

    await this.audit.record({
      organizationId: row.organizationId,
      actorType: "INVITATION_TOKEN",
      action: AuditAction.InvitationAccepted,
      entityType: "TenantInvitation",
      entityId: row.id,
      metadata: { tenantEmail: row.tenantEmail },
    });
    await this.audit.record({
      organizationId: row.organizationId,
      actorType: "INVITATION_TOKEN",
      action: AuditAction.InspectionStarted,
      entityType: "Inspection",
      entityId: updatedInspection.id,
      metadata: { invitationId: row.id },
    });

    return { invitation: mapInvitation(updatedInvitation), inspection: mapInspection(updatedInspection) };
  }

  /** Read-only: lets a token principal see which property/inspection their invitation is for. */
  async getMyInvitation(principal: Principal) {
    if (principal.type !== "invitation" || !principal.invitationId) {
      throw new ConflictError("INVALID_PRINCIPAL", "Invitation token required");
    }

    const row = await this.prisma.tenantInvitation.findUnique({
      where: { id: principal.invitationId },
      include: { tenancy: { include: { unit: { include: { property: true } } } } },
    });
    if (!row) throw new NotFoundError("Invitation not found");

    const inspection = await this.prisma.inspection.findFirst({
      where: { tenancyId: row.tenancyId, OR: [{ status: "DRAFT" }, { invitationId: row.id }] },
      orderBy: { createdAt: "desc" },
    });

    return {
      invitation: mapInvitation(row),
      property: { displayName: row.tenancy.unit.property.displayName },
      inspection: inspection ? { id: inspection.id, status: inspection.status } : null,
    };
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
