import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./auth.guard.js";
import { GoogleOAuthService } from "./google-oauth.service.js";

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, GoogleOAuthService],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
