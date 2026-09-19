import { INestApplication } from "@nestjs/common";
import { ProblemExceptionFilter } from "./shared/problem.filter.js";

/** Shared bootstrap used by both main.ts and the integration tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    credentials: true,
  });
  app.useGlobalFilters(new ProblemExceptionFilter());
  return app;
}
