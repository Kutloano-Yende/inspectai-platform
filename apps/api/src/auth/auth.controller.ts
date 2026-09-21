import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { LoginRequest, RegisterRequest } from "@inspectai/contracts";
import { ZodValidationPipe } from "../shared/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import {
  clearedOauthStateCookie,
  clearedSessionCookie,
  oauthStateCookie,
  OAUTH_STATE_COOKIE,
  readCookie,
  sessionCookie,
  SESSION_COOKIE,
} from "./auth.guard.js";
import { GoogleOAuthService } from "./google-oauth.service.js";
import { AppleOAuthService } from "./apple-oauth.service.js";
import { MicrosoftOAuthService } from "./microsoft-oauth.service.js";
import { CurrentUser, type Principal } from "./principal.js";
import { Public } from "./public.decorator.js";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GoogleOAuthService) private readonly googleOAuth: GoogleOAuthService,
    @Inject(AppleOAuthService) private readonly appleOAuth: AppleOAuthService,
    @Inject(MicrosoftOAuthService) private readonly microsoftOAuth: MicrosoftOAuthService,
  ) {}

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

  @Public()
  @Get("providers")
  providers() {
    return {
      google: this.googleOAuth.isConfigured(),
      apple: this.appleOAuth.isConfigured(),
      microsoft: this.microsoftOAuth.isConfigured(),
    };
  }

  @Public()
  @Get("google")
  async googleStart(@Res() res: Response) {
    const { url, state } = this.googleOAuth.buildAuthorizationRequest();
    res.setHeader("Set-Cookie", oauthStateCookie(state));
    res.redirect(url);
  }

  @Public()
  @Get("google/callback")
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const cookieState = readCookie(req, OAUTH_STATE_COOKIE);

    if (!code || !state || !cookieState || state !== cookieState) {
      res.setHeader("Set-Cookie", clearedOauthStateCookie());
      res.redirect(`${webAppUrl}/login?error=oauth_failed`);
      return;
    }

    try {
      const profile = await this.googleOAuth.exchangeCodeForProfile(code);
      const result = await this.auth.loginOrRegisterWithGoogle(profile);
      res.setHeader("Set-Cookie", [clearedOauthStateCookie(), sessionCookie(result.sessionToken)]);
      res.redirect(`${webAppUrl}/app/inspections`);
    } catch {
      res.setHeader("Set-Cookie", clearedOauthStateCookie());
      res.redirect(`${webAppUrl}/login?error=oauth_failed`);
    }
  }

  @Public()
  @Get("apple")
  async appleStart(@Res() res: Response) {
    const { url, state } = this.appleOAuth.buildAuthorizationRequest();
    res.setHeader("Set-Cookie", oauthStateCookie(state));
    res.redirect(url);
  }

  // Apple posts here (response_mode=form_post is required whenever name/email scopes are requested).
  @Public()
  @Post("apple/callback")
  @HttpCode(302)
  async appleCallback(
    @Req() req: Request,
    @Body() body: { code?: string; state?: string; user?: string },
    @Res() res: Response,
  ) {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    const { code, state, user } = body;
    const cookieState = readCookie(req, OAUTH_STATE_COOKIE);

    if (!code || !state || !cookieState || state !== cookieState) {
      res.setHeader("Set-Cookie", clearedOauthStateCookie());
      res.redirect(`${webAppUrl}/login?error=oauth_failed`);
      return;
    }

    try {
      const profile = await this.appleOAuth.exchangeCodeForProfile(code, user);
      const result = await this.auth.loginOrRegisterWithApple(profile);
      res.setHeader("Set-Cookie", [clearedOauthStateCookie(), sessionCookie(result.sessionToken)]);
      res.redirect(`${webAppUrl}/app/inspections`);
    } catch {
      res.setHeader("Set-Cookie", clearedOauthStateCookie());
      res.redirect(`${webAppUrl}/login?error=oauth_failed`);
    }
  }

  @Public()
  @Get("microsoft")
  async microsoftStart(@Res() res: Response) {
    const { url, state } = this.microsoftOAuth.buildAuthorizationRequest();
    res.setHeader("Set-Cookie", oauthStateCookie(state));
    res.redirect(url);
  }

  @Public()
  @Get("microsoft/callback")
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const cookieState = readCookie(req, OAUTH_STATE_COOKIE);

    if (!code || !state || !cookieState || state !== cookieState) {
      res.setHeader("Set-Cookie", clearedOauthStateCookie());
      res.redirect(`${webAppUrl}/login?error=oauth_failed`);
      return;
    }

    try {
      const profile = await this.microsoftOAuth.exchangeCodeForProfile(code);
      const result = await this.auth.loginOrRegisterWithMicrosoft(profile);
      res.setHeader("Set-Cookie", [clearedOauthStateCookie(), sessionCookie(result.sessionToken)]);
      res.redirect(`${webAppUrl}/app/inspections`);
    } catch {
      res.setHeader("Set-Cookie", clearedOauthStateCookie());
      res.redirect(`${webAppUrl}/login?error=oauth_failed`);
    }
  }
}
