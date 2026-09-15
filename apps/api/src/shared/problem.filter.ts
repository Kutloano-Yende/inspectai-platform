import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";

/** Renders every error as an RFC 7807 problem+json document (contracts ProblemDetail). */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const status = exception.getStatus();
      const code = typeof body === "object" && body !== null && "code" in body ? String((body as any).code) : "HTTP_ERROR";
      const detail = typeof body === "object" && body !== null && "detail" in body ? String((body as any).detail) : exception.message;
      res.status(status).type("application/problem+json").json({
        type: "about:blank",
        title: typeof body === "object" && body !== null && "title" in body ? String((body as any).title) : exception.message,
        status,
        code,
        detail: detail || undefined,
      });
      return;
    }

    console.error(exception); // unexpected: log full error, return generic problem
    res.status(500).type("application/problem+json").json({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "INTERNAL_ERROR",
    });
  }
}
