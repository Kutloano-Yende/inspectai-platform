import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CreatePropertyRequest, CreateUnitRequest } from "@inspectai/contracts";
import { ZodValidationPipe } from "../shared/zod.pipe.js";
import { PortfolioService } from "./portfolio.service.js";
import { CurrentUser, type Principal } from "../auth/principal.js";

@Controller()
export class PortfolioController {
  constructor(@Inject(PortfolioService) private readonly portfolio: PortfolioService) {}

  @Get("properties")
  listProperties(@CurrentUser() principal: Principal) {
    return this.portfolio.listProperties(principal);
  }

  @Post("properties")
  @HttpCode(201)
  createProperty(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreatePropertyRequest)) dto: CreatePropertyRequest,
  ) {
    return this.portfolio.createProperty(principal, dto);
  }

  @Get("properties/:id")
  getProperty(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.portfolio.getProperty(principal, id);
  }

  @Post("properties/:id/units")
  @HttpCode(201)
  createUnit(
    @CurrentUser() principal: Principal,
    @Param("id") propertyId: string,
    @Body(new ZodValidationPipe(CreateUnitRequest)) dto: CreateUnitRequest,
  ) {
    return this.portfolio.createUnit(principal, propertyId, dto);
  }
}
