import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { OrgModule } from "../org/org.module.js";
import { PortfolioController } from "./portfolio.controller.js";
import { PortfolioService } from "./portfolio.service.js";

@Module({
  imports: [AuditModule, OrgModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
