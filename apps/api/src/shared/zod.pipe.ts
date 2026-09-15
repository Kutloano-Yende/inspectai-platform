import { z } from "zod";
import { type ArgumentMetadata, type PipeTransform } from "@nestjs/common";
import { ValidationFailedError } from "./errors.js";

/** Validates route arguments against a shared @inspectai/contracts schema. */
export class ZodValidationPipe<T extends z.ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedError(
        result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      );
    }
    return result.data;
  }
}
