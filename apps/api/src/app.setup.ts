import { INestApplication } from "@nestjs/common";
import { ProblemExceptionFilter } from "./shared/problem.filter.js";

const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"];

/** CORS origins come from CORS_ORIGINS (comma-separated) in production; local dev defaults if unset. */
function corsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS;
  if (!configured) return DEFAULT_CORS_ORIGINS;
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Shared bootstrap used by both main.ts and the integration tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  app.useGlobalFilters(new ProblemExceptionFilter());
  return app;
}
