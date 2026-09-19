import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { LoginRequest, RegisterRequest } from "@inspectai/contracts";
import { ZodValidationPipe } from "../shared/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import { clearedSessionCookie, readCookie, sessionCookie, SESSION_COOKIE } from "./auth.guard.js";
import { CurrentUser, type Principal } from "./principal.js";
import { Public } from "./public.decorator.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(RegisterRequest)) dto: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto);
    const token = await this.auth.issueSessionForNewOrganization(result.user.id);
    res.setHeader("Set-Cookie", sessionCookie(token));
    return { user: result.user, organization: result.organization };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) dto: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);
    res.setHeader("Set-Cookie", sessionCookie(result.sessionToken));
    return { user: result.user };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.auth.logout(token);
    res.setHeader("Set-Cookie", clearedSessionCookie());
    return { ok: true };
  }

  @Get("me")
  async me(@CurrentUser() principal: Principal) {
    if (!principal.userId) throw new Error("userId required");
    return this.auth.me({ userId: principal.userId });
  }
}
