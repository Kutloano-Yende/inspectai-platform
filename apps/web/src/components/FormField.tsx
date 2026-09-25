import type { ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/** Label + control + error/hint, on coss ui's Field (which links the label to the control). */
export function FormField({ label, required, error, hint, className, children }: FormFieldProps) {
  return (
    <Field invalid={Boolean(error)} {...(className ? { className } : {})}>
      <FieldLabel>
        {label}
        {required && (
          <span className="text-primary" aria-hidden="true">
            *
          </span>
        )}
      </FieldLabel>
      {children}
      {error ? <FieldError match>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
