import { Module } from "@nestjs/common";
import { OrgAccessService } from "./org-access.service.js";

@Module({
  providers: [OrgAccessService],
  exports: [OrgAccessService],
})
export class OrgModule {}
