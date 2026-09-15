import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { OrgModule } from "./org/org.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { StorageModule } from "./queue/storage.module.js";
import { PortfolioModule } from "./portfolio/portfolio.module.js";
import { TenancyModule } from "./tenancy/tenancy.module.js";
import { InspectionModule } from "./inspection/inspection.module.js";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    OrgModule,
    QueueModule,
    StorageModule,
    AuthModule,
    PortfolioModule,
    TenancyModule,
    InspectionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
