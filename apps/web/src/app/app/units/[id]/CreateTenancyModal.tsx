"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useCreateTenancy } from "@/lib/hooks/usePortfolio";
import { CreateTenancyRequest } from "@inspectai/contracts";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";

interface CreateTenancyModalProps {
  unitId: string;
  onClose: () => void;
}

/** Date inputs give "YYYY-MM-DD"; the API contract wants a full ISO datetime, or null when open-ended. */
const toIsoDateTime = (date: string | null | undefined) => (date ? new Date(`${date}T00:00:00.000Z`).toISOString() : null);

export function CreateTenancyModal({ unitId, onClose }: CreateTenancyModalProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateTenancyRequest>({
    defaultValues: { startDate: new Date().toISOString().split("T")[0], endDate: null },
  });

  const { mutate: createTenancy, isPending, error } = useCreateTenancy(unitId);

  const onSubmit = (data: CreateTenancyRequest) => {
    const startDate = toIsoDateTime(data.startDate);
    if (!startDate) return;
    createTenancy(
      { startDate, endDate: toIsoDateTime(data.endDate) },
      {
        // There is no "list a unit's tenancies" endpoint yet, so open the new tenancy directly.
        onSuccess: (tenancy) => {
          reset();
          onClose();
          router.push(`/app/tenancies/${tenancy.id}`);
        },
      },
    );
  };

  return (
    <FormDialog
      title="Create Tenancy"
      submitLabel="Create Tenancy"
      pendingLabel="Creating..."
      isPending={isPending}
      error={error?.message}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormField label="Start Date" required error={errors.startDate?.message}>
        <Input type="date" {...register("startDate", { required: "Start date is required" })} disabled={isPending} />
      </FormField>

      <FormField label="End Date" hint="Leave blank for open-ended tenancy">
        <Input type="date" {...register("endDate")} disabled={isPending} />
      </FormField>
    </FormDialog>
  );
}
