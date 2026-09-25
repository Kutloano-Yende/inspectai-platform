"use client";

import { useForm } from "react-hook-form";
import { useCreateInvitation } from "@/lib/hooks/usePortfolio";
import { CreateInvitationRequest } from "@inspectai/contracts";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CreateInvitationModalProps {
  tenancyId: string;
  onClose: () => void;
}

export function CreateInvitationModal({ tenancyId, onClose }: CreateInvitationModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateInvitationRequest>({
    defaultValues: { tenantEmail: "", tenantFullName: "", tenantPhone: "" },
  });

  const { mutate: createInvitation, isPending, error, data } = useCreateInvitation(tenancyId);

  const onSubmit = ({ tenantPhone, ...values }: CreateInvitationRequest) => {
    // The contract rejects an empty phone string; an untouched optional field must be omitted.
    createInvitation({ ...values, ...(tenantPhone ? { tenantPhone } : {}) }, { onSuccess: () => reset() });
  };

  if (data) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Invitation Created</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Alert variant="success">
              <AlertTitle>Invitation sent successfully</AlertTitle>
            </Alert>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Invitation Token</p>
              <p className="select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
                {data.invitationToken}
              </p>
              <p className="text-xs text-muted-foreground">
                Share this token with the tenant or copy it to send via email.
              </p>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    );
  }

  return (
    <FormDialog
      title="Invite Tenant"
      submitLabel="Send Invitation"
      pendingLabel="Sending..."
      isPending={isPending}
      error={error?.message}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormField label="Tenant Name" required error={errors.tenantFullName?.message}>
        <Input
          {...register("tenantFullName", { required: "Tenant name is required" })}
          placeholder="John Doe"
          disabled={isPending}
        />
      </FormField>

      <FormField label="Email" required error={errors.tenantEmail?.message}>
        <Input
          type="email"
          {...register("tenantEmail", { required: "Email is required" })}
          placeholder="tenant@example.com"
          disabled={isPending}
        />
      </FormField>

      <FormField label="Phone">
        <Input {...register("tenantPhone")} placeholder="+27 (optional)" disabled={isPending} />
      </FormField>
    </FormDialog>
  );
}
