import { HttpStatus } from "@nestjs/common";
import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import { ProblemError } from "./errors.js";

interface VerifyRs256Options {
  jwksUrl: string;
  /** Throw to reject the token; called only after signature + expiry are already confirmed valid. */
  validateClaims: (claims: Record<string, unknown>) => void;
  errorCode: string;
  errorDetail: string;
}

/**
 * Verifies an RS256-signed OIDC ID token against a provider's live JWKS endpoint.
 * Shared by Apple and Microsoft sign-in, which both issue RS256 ID tokens with no
 * REST "userinfo" alternative — the signature is the only thing making the claims trustworthy.
 * Throws ProblemError on any failure (bad shape, unknown key, bad signature, expired, bad claims).
 */
export async function verifyRs256Jwt(idToken: string, opts: VerifyRs256Options): Promise<Record<string, unknown>> {
  const fail = (): never => {
    throw new ProblemError(opts.errorCode, HttpStatus.BAD_GATEWAY, opts.errorDetail);
  };

  const parts = idToken.split(".");
  if (parts.length !== 3) throw fail();
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") throw fail();

  const jwksRes = await fetch(opts.jwksUrl);
  if (!jwksRes.ok) throw fail();
  const { keys } = (await jwksRes.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw fail();

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");
  const valid = createVerify("RSA-SHA256").update(signingInput).verify(publicKey, signature);
  if (!valid) throw fail();

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) throw fail();

  opts.validateClaims(claims);
  return claims;
}
