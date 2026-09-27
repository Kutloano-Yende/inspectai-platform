import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";

/**
 * Liveness check for the hosting platform (Render's healthCheckPath, load balancers, uptime
 * monitors). Deliberately does not touch the database — a DB outage shouldn't make the
 * platform kill and restart an otherwise-healthy process. No business logic, no auth.
 */
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }
}
