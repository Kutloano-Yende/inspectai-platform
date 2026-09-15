import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

type ActorType = "USER" | "INVITATION_TOKEN" | "SYSTEM";

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: {
    organizationId?: string | null;
    actorType: ActorType;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        actorType: input.actorType,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  }
}
