import { HttpStatus, Injectable } from "@nestjs/common";
import { createPrivateKey, createPublicKey, createSign, createVerify, type JsonWebKey } from "node:crypto";
import { generateToken } from "../shared/crypto.js";
import { ProblemError } from "../shared/errors.js";

const AUTHORIZATION_ENDPOINT = "https://appleid.apple.com/auth/authorize";
const TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
const KEYS_ENDPOINT = "https://appleid.apple.com/auth/keys";
const ISSUER = "https://appleid.apple.com";

export interface AppleProfile {
  appleId: string;
  email: string;
  fullName: string;
}

interface AppleConfig {
  teamId: string;
  servicesId: string;
  keyId: string;
  privateKey: string;
}

/** Config is read lazily (not cached at module load) so a missing setup fails per-request, not at boot. */
function readConfig(): AppleConfig | null {
  const teamId = process.env.APPLE_TEAM_ID;
  const servicesId = process.env.APPLE_SERVICES_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const rawKey = process.env.APPLE_PRIVATE_KEY;
  if (!teamId || !servicesId || !keyId || !rawKey) return null;
  // .env stores the .p8 PEM on one line with literal "\n" — restore real newlines.
  return { teamId, servicesId, keyId, privateKey: rawKey.replace(/\\n/g, "\n") };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Apple's client secret is a short-lived JWT we sign ourselves with our ES256 private key. */
function signClientSecret(config: AppleConfig): string {
  const header = { alg: "ES256", kid: config.keyId };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.teamId,
    iat: now,
    exp: now + 300,
    aud: ISSUER,
    sub: config.servicesId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const privateKey = createPrivateKey(config.privateKey);
  // JWT ES256 signatures are raw R||S ("ieee-p1363"), not the DER format crypto.sign uses by default.
  const signature = createSign("SHA256").update(signingInput).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  aud: string;
  iss: string;
  exp: number;
}

/** Verifies Apple's signed ID token against Apple's live JWKS — no trust without a valid signature. */
async function verifyIdToken(idToken: string, config: AppleConfig): Promise<AppleIdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Apple sign-in");
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { kid?: string; alg?: string };

  const jwksRes = await fetch(KEYS_ENDPOINT);
  if (!jwksRes.ok) {
    throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Apple sign-in");
  }
  const { keys } = (await jwksRes.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "RS256") {
    throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Apple sign-in");
  }

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");
  const valid = createVerify("RSA-SHA256").update(signingInput).verify(publicKey, signature);
  if (!valid) {
    throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not verify Apple sign-in");
  }

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as AppleIdTokenClaims;
  if (claims.iss !== ISSUER || claims.aud !== config.servicesId || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not verify Apple sign-in");
  }

  return claims;
}

@Injectable()
export class AppleOAuthService {
  isConfigured(): boolean {
    return readConfig() !== null;
  }

  /** Builds Apple's consent screen URL and a CSRF state token to pair with it. */
  buildAuthorizationRequest(): { url: string; state: string } {
    const config = readConfig();
    if (!config) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Apple sign-in is not configured on this server");
    }

    const redirectUri = process.env.APPLE_REDIRECT_URI;
    if (!redirectUri) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Apple sign-in is not configured on this server");
    }

    const state = generateToken();
    const params = new URLSearchParams({
      client_id: config.servicesId,
      redirect_uri: redirectUri,
      response_type: "code",
      // Apple requires form_post (not query-string) whenever name/email scopes are requested.
      response_mode: "form_post",
      scope: "name email",
      state,
    });
    return { url: `${AUTHORIZATION_ENDPOINT}?${params.toString()}`, state };
  }

  /**
   * Exchanges an authorization code for the user's verified Apple profile.
   * `userField` is Apple's raw JSON `user` form field — present ONLY on the very first
   * authorization ever, e.g. {"name":{"firstName":"...","lastName":"..."}}.
   */
  async exchangeCodeForProfile(code: string, userField?: string): Promise<AppleProfile> {
    const config = readConfig();
    const redirectUri = process.env.APPLE_REDIRECT_URI;
    if (!config || !redirectUri) {
      throw new ProblemError("OAUTH_NOT_CONFIGURED", HttpStatus.SERVICE_UNAVAILABLE, "Apple sign-in is not configured on this server");
    }

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.servicesId,
        client_secret: signClientSecret(config),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Apple sign-in");
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw new ProblemError("OAUTH_EXCHANGE_FAILED", HttpStatus.BAD_GATEWAY, "Could not complete Apple sign-in");
    }

    const claims = await verifyIdToken(tokens.id_token, config);
    if (!claims.email || (claims.email_verified !== true && claims.email_verified !== "true")) {
      throw new ProblemError("OAUTH_EMAIL_UNVERIFIED", HttpStatus.FORBIDDEN, "Apple account email is not verified");
    }

    let fullName = claims.email.split("@")[0] || "Apple User";
    if (userField) {
      try {
        const parsed = JSON.parse(userField) as { name?: { firstName?: string; lastName?: string } };
        const name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ");
        if (name) fullName = name;
      } catch {
        // Malformed or absent — keep the email-derived fallback.
      }
    }

    return { appleId: claims.sub, email: claims.email, fullName };
  }
}
