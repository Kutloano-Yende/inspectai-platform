import { INestApplication } from "@nestjs/common";
import { ProblemExceptionFilter } from "./shared/problem.filter.js";

/** Shared bootstrap used by both main.ts and the integration tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ProblemExceptionFilter());
  return app;
}
