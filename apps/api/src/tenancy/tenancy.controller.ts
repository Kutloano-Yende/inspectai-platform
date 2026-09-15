import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CreateInvitationRequest, CreateTenancyRequest } from "@inspectai/contracts";
import { ZodValidationPipe } from "../shared/zod.pipe.js";
import { TenancyService } from "./tenancy.service.js";
import { CurrentUser, type Principal } from "../auth/principal.js";

@Controller()
export class TenancyController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Post("units/:id/tenancies")
  @HttpCode(201)
  createTenancy(
    @CurrentUser() principal: Principal,
    @Param("id") unitId: string,
    @Body(new ZodValidationPipe(CreateTenancyRequest)) dto: CreateTenancyRequest,
  ) {
    return this.tenancy.createTenancy(principal, unitId, dto);
  }

  @Get("tenancies/:id")
  getTenancy(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.tenancy.getTenancy(principal, id);
  }

  @Post("tenancies/:id/invitations")
  @HttpCode(201)
  createInvitation(
    @CurrentUser() principal: Principal,
    @Param("id") tenancyId: string,
    @Body(new ZodValidationPipe(CreateInvitationRequest)) dto: CreateInvitationRequest,
  ) {
    return this.tenancy.createInvitation(principal, tenancyId, dto);
  }

  @Post("invitations/:id/revoke")
  @HttpCode(200)
  revokeInvitation(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.tenancy.revokeInvitation(principal, id);
  }

  @Post("invitations/accept")
  @HttpCode(200)
  acceptInvitation(@CurrentUser() principal: Principal) {
    return this.tenancy.acceptInvitation(principal);
  }
}
