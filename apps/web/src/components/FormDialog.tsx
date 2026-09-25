"use client";

import type { FormEventHandler, ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";

interface FormDialogProps {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  /** Message from a failed submit (e.g. the API's validation error). */
  error?: string | undefined;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}

/**
 * Shared shell for the "create" dialogs: coss Dialog + Form, an error alert, and Cancel/Submit.
 * Mounted only while open, so it is always `open` and reports closes through onClose.
 */
export function FormDialog({ title, submitLabel, pendingLabel, isPending, error, onClose, onSubmit, children }: FormDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogPanel className="flex flex-col gap-4">
            {children}
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}
