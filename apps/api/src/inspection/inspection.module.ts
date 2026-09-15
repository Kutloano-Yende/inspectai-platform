import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OrgModule } from "../org/org.module.js";
import { InspectionController } from "./inspection.controller.js";
import { InspectionService } from "./inspection.service.js";

@Module({
  imports: [AuditModule, OrgModule],
  controllers: [InspectionController],
  providers: [InspectionService],
})
export class InspectionModule {}
