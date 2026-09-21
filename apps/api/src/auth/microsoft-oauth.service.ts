import { HttpStatus, Injectable } from "@nestjs/common";
import { generateToken } from "../shared/crypto.js";
import { ProblemError } from "../shared/errors.js";
import { verifyRs256Jwt } from "../shared/oidc-jwt.js";

// "common" accepts both personal Microsoft accounts and work/school (Azure AD) accounts.
const TENANT = "common";
const AUTHORIZATION_ENDPOINT = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
// Stable multi-tenant JWKS: valid for tokens issued to any tenant via the "common" endpoint.
const KEYS_ENDPOINT = "https://login.microsoftonline.com/common/discovery/v2.0/keys";

export interface MicrosoftProfile {
  microsoftId: string;
  email: string;
  fullName: string;
}

interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Config is read lazily (not cached at module load) so a missing setup fails per-request, not at boot. */
function readConfig(): MicrosoftConfig | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

interface MicrosoftIdTokenClaims {
  sub: string;
  tid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
}

/**
 * Verifies Microsoft's signed ID token against its live JWKS. Because "common" is multi-tenant,
 * there's no single fixed issuer to compare against — instead the issuer must be internally
 * consistent with the token's own tenant id, which is the validation Microsoft's docs recommend
 * for multi-tenant apps.
 */
async function verifyIdToken(idToken: string, config: MicrosoftConfig): Promise<MicrosoftIdTokenClaims> {
  const claims = await verifyRs256Jwt(idToken, {
    jwksUrl: KEYS_ENDPOINT,
    errorCode: "OAUTH_EXCHANGE_FAILED",
    errorDetail: "Could not verify Microsoft sign-in",
    validateClaims: (c) => {
      const expectedIssuer = `https://login.microsoftonline.com/${c.tid as string}/v2.0`;
      if (c.aud !== config.clientId || !c.tid || c.iss !== expectedIssuer) {
        throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not verify Microsoft sign-in");
      }
    },
  });
  return claims as unknown as MicrosoftIdTokenClaims;
}

@Injectable()
export class MicrosoftOAuthService {
  isConfigured(): boolean {
    return readConfig() !== null;
  }

  /** Builds Microsoft's consent screen URL and a CSRF state token to pair with it. */
  buildAuthorizationRequest(): { url: string; state: string } {
    const config = readConfig();
    if (!config) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Microsoft sign-in is not configured on this server");
    }

    const state = generateToken();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return { url: `${AUTHORIZATION_ENDPOINT}?${params.toString()}`, state };
  }

  /** Exchanges an authorization code for the user's verified Microsoft profile. */
  async exchangeCodeForProfile(code: string): Promise<MicrosoftProfile> {
    const config = readConfig();
    if (!config) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Microsoft sign-in is not configured on this server");
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
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Microsoft sign-in");
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Microsoft sign-in");
    }

    const claims = await verifyIdToken(tokens.id_token, config);
    const email = claims.email || claims.preferred_username;
    if (!email) {
      throw new ProblemError("OAUTH_EMAIL_UNVERIFIED", HttpStatus.FORBIDDEN, "Microsoft account has no email");
    }

    return { microsoftId: claims.sub, email, fullName: claims.name || email };
  }
}
