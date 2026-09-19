import { Inject, Injectable } from "@nestjs/common";
import { CreatePropertyRequest, CreateUnitRequest } from "@inspectai/contracts";
import { AuditAction } from "@inspectai/domain";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { OrgAccessService, PORTFOLIO_ROLES } from "../org/org-access.service.js";
import { NotFoundError } from "../shared/errors.js";
import type { Principal } from "../auth/principal.js";

@Injectable()
export class PortfolioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OrgAccessService) private readonly org: OrgAccessService,
  ) {}

  /** List properties across the principal's organizations (never another org's). */
  async listProperties(principal: Principal) {
    const orgIds = (principal.memberships || []).map((m) => m.organizationId);
    const rows = await this.prisma.property.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { createdAt: "desc" },
      include: { units: true },
    });
    return rows.map(mapProperty);
  }

  async createProperty(principal: Principal, dto: CreatePropertyRequest) {
    const organizationId = this.org.resolveOrgId(principal, (dto as any).organizationId);
    this.org.assertRole(principal, organizationId, PORTFOLIO_ROLES);
    const row = await this.prisma.property.create({
      data: {
        organizationId,
        displayName: dto.displayName,
        propertyType: dto.propertyType,
        addressLine1: dto.address.line1,
        ...(dto.address.line2 ? { addressLine2: dto.address.line2 } : {}),
        city: dto.address.city,
        province: dto.address.province,
        postalCode: dto.address.postalCode,
        country: dto.address.country,
      },
    });
    await this.audit.record({
      organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.PropertyCreated,
      entityType: "Property",
      entityId: row.id,
      metadata: { displayName: row.displayName },
    });
    return mapProperty(row);
  }

  async getProperty(principal: Principal, id: string) {
    const row = await this.prisma.property.findUnique({ where: { id }, include: { units: true } });
    if (!row) throw new NotFoundError("Property not found");
    this.org.assertMembership(principal, row.organizationId); // 404 for non-members
    return mapProperty(row);
  }

  async createUnit(principal: Principal, propertyId: string, dto: CreateUnitRequest) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundError("Property not found");
    this.org.assertRole(principal, property.organizationId, PORTFOLIO_ROLES); // org resolved from the property row
    const row = await this.prisma.unit.create({
      data: {
        propertyId: property.id,
        organizationId: property.organizationId,
        label: dto.label,
        ...(dto.bedrooms != null ? { bedrooms: dto.bedrooms } : {}),
        ...(dto.bathrooms != null ? { bathrooms: dto.bathrooms } : {}),
      },
    });
    await this.audit.record({
      organizationId: property.organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.UnitCreated,
      entityType: "Unit",
      entityId: row.id,
      metadata: { propertyId: property.id, label: row.label },
    });
    return mapUnit(row);
  }
}

export function mapProperty(row: any) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    propertyType: row.propertyType,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2 ?? undefined,
      city: row.city,
      province: row.province,
      postalCode: row.postalCode,
      country: row.country,
    },
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    units: row.units?.map(mapUnit),
  };
}

export function mapUnit(row: any) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    organizationId: row.organizationId,
    label: row.label,
    bedrooms: row.bedrooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    createdAt: row.createdAt,
  };
}
