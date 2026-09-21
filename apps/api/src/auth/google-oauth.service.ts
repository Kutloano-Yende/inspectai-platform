import { Injectable } from "@nestjs/common";
import { generateToken } from "../shared/crypto.js";
import { ProblemError } from "../shared/errors.js";
import { HttpStatus } from "@nestjs/common";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleProfile {
  googleId: string;
  email: string;
  fullName: string;
}

/** Google's config is read lazily (not at module load) so a missing setup fails per-request, not at boot. */
function readConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

@Injectable()
export class GoogleOAuthService {
  isConfigured(): boolean {
    return readConfig() !== null;
  }

  /** Builds the Google consent screen URL and a CSRF state token to pair with it. */
  buildAuthorizationRequest(): { url: string; state: string } {
    const config = readConfig();
    if (!config) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Google sign-in is not configured on this server");
    }

    const state = generateToken();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return { url: `${AUTHORIZATION_ENDPOINT}?${params.toString()}`, state };
  }

  /** Exchanges an authorization code for the user's verified Google profile. */
  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const config = readConfig();
    if (!config) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Google sign-in is not configured on this server");
    }

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Google sign-in");
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) {
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Google sign-in");
    }

    const profileRes = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Google sign-in");
    }
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.sub || !profile.email || !profile.email_verified) {
      throw new ProblemError("OAUTH_EMAIL_UNVERIFIED", HttpStatus.FORBIDDEN, "Google account email is not verified");
    }

    return { googleId: profile.sub, email: profile.email, fullName: profile.name || profile.email };
  }
}
