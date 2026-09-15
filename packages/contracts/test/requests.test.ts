import { describe, expect, it } from "vitest";
import {
  CreateInvitationRequest,
  CreatePropertyRequest,
  CreateTenancyRequest,
  CreateUnitRequest,
  LoginRequest,
  RegisterRequest,
} from "../src/index.js";

const address = { line1: "24 Oak Street", city: "Johannesburg", province: "Gauteng", postalCode: "2196", country: "ZA" as const };

describe("auth request contracts", () => {
  it("accepts a valid registration", () => {
    const r = RegisterRequest.parse({
      organizationName: "Acme Rentals", fullName: "S J", email: "s@acme.co.za", password: "Str0ngPassphrase!",
    });
    expect(r.email).toBe("s@acme.co.za");
  });

  it("rejects short passwords and invalid emails", () => {
    expect(RegisterRequest.safeParse({ organizationName: "A", fullName: "B", email: "x@y.z", password: "short" }).success).toBe(false);
    expect(RegisterRequest.safeParse({ organizationName: "A", fullName: "B", email: "nope", password: "Str0ngPassphrase!" }).success).toBe(false);
  });

  it("login requires a valid email", () => {
    expect(LoginRequest.safeParse({ email: "ok@x.co.za", password: "x" }).success).toBe(true);
    expect(LoginRequest.safeParse({ email: "bad", password: "x" }).success).toBe(false);
  });
});

describe("portfolio request contracts", () => {
  it("accepts a property and defaults type to RESIDENTIAL", () => {
    const r = CreatePropertyRequest.parse({ displayName: "24 Oak", address });
    expect(r.propertyType).toBe("RESIDENTIAL");
  });

  it("rejects non-ZA property addresses (Phase 1 market)", () => {
    expect(CreatePropertyRequest.safeParse({ displayName: "X", address: { ...address, country: "DE" } }).success).toBe(false);
  });

  it("accepts a unit without bedrooms/bathrooms but rejects negative ones", () => {
    expect(CreateUnitRequest.safeParse({ label: "Unit 1" }).success).toBe(true);
    expect(CreateUnitRequest.safeParse({ label: "Unit 1", bedrooms: -1 }).success).toBe(false);
  });
});

describe("tenancy request contracts", () => {
  it("requires ISO datetimes; endDate optional", () => {
    expect(CreateTenancyRequest.safeParse({ startDate: "2026-09-12T00:00:00.000Z" }).success).toBe(true);
    expect(CreateTenancyRequest.safeParse({ startDate: "12/09/2026" }).success).toBe(false);
  });

  it("invitation requires a valid email and a name", () => {
    expect(CreateInvitationRequest.safeParse({ tenantEmail: "t@x.co.za", tenantFullName: "T M" }).success).toBe(true);
    expect(CreateInvitationRequest.safeParse({ tenantEmail: "t@x.co.za", tenantFullName: "" }).success).toBe(false);
  });
});
