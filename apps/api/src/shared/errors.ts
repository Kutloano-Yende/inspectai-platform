import { HttpException, HttpStatus } from "@nestjs/common";

/** Problem+json error with a stable machine-readable code (contracts ProblemDetail). */
export class ProblemError extends HttpException {
  constructor(
    readonly code: string,
    statusCode: HttpStatus,
    readonly detail?: string,
  ) {
    super({ code, detail, title: reasonFor(statusCode) }, statusCode);
  }
}

function reasonFor(status: HttpStatus): string {
  // Titles are stable strings for the API surface.
  return (
    {
      [HttpStatus.BAD_REQUEST]: "Bad Request",
      [HttpStatus.UNAUTHORIZED]: "Unauthorized",
      [HttpStatus.FORBIDDEN]: "Forbidden",
      [HttpStatus.NOT_FOUND]: "Not Found",
      [HttpStatus.CONFLICT]: "Conflict",
      [HttpStatus.GONE]: "Gone",
      [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal Server Error",
    } as Record<number, string>
  )[status] ?? "Error";
}

export class ValidationFailedError extends ProblemError {
  constructor(issues: string[]) {
    super("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, issues.join("; "));
  }
}

export class UnauthorizedError extends ProblemError {
  constructor(code = "UNAUTHENTICATED", detail = "Authentication required") {
    super(code, HttpStatus.UNAUTHORIZED, detail);
  }
}

/** Resource-not-in-your-organisation responses use 404: existence is not revealed. */
export class NotFoundError extends ProblemError {
  constructor(detail = "Resource not found") {
    super("NOT_FOUND", HttpStatus.NOT_FOUND, detail);
  }
}

export class ForbiddenError extends ProblemError {
  constructor(code: string, detail: string) {
    super(code, HttpStatus.FORBIDDEN, detail);
  }
}

export class ConflictError extends ProblemError {
  constructor(code: string, detail: string) {
    super(code, HttpStatus.CONFLICT, detail);
  }
}

export class GoneError extends ProblemError {
  constructor(code: string, detail: string) {
    super(code, HttpStatus.GONE, detail);
  }
}
