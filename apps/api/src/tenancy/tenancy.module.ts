import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OrgModule } from "../org/org.module.js";
import { TenancyController } from "./tenancy.controller.js";
import { TenancyService } from "./tenancy.service.js";

@Module({
  imports: [AuditModule, OrgModule],
  controllers: [TenancyController],
  providers: [TenancyService],
})
export class TenancyModule {}
