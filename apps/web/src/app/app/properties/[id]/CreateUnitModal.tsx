"use client";

import { useForm } from "react-hook-form";
import { useCreateUnit } from "@/lib/hooks/usePortfolio";
import { CreateUnitRequest } from "@inspectai/contracts";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";

interface CreateUnitModalProps {
  propertyId: string;
  onClose: () => void;
}

/** Number inputs yield strings; the API expects integers, and both fields are optional. */
const optionalNumber = (value: unknown) => (value === "" || value == null ? undefined : Number(value));

export function CreateUnitModal({ propertyId, onClose }: CreateUnitModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateUnitRequest>({
    defaultValues: { label: "", bedrooms: undefined, bathrooms: undefined },
  });

  const { mutate: createUnit, isPending, error } = useCreateUnit(propertyId);

  const onSubmit = (data: CreateUnitRequest) => {
    createUnit(data, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  };

  return (
    <FormDialog
      title="Create Unit"
      submitLabel="Create Unit"
      pendingLabel="Creating..."
      isPending={isPending}
      error={error?.message}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormField label="Unit Name" required error={errors.label?.message}>
        <Input
          {...register("label", { required: "Unit name is required" })}
          placeholder="e.g., Unit 4B, Main House"
          disabled={isPending}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Bedrooms" error={errors.bedrooms?.message}>
          <Input
            type="number"
            min={0}
            {...register("bedrooms", { min: 0, setValueAs: optionalNumber })}
            placeholder="0"
            disabled={isPending}
          />
        </FormField>

        <FormField label="Bathrooms" error={errors.bathrooms?.message}>
          <Input
            type="number"
            min={0}
            {...register("bathrooms", { min: 0, setValueAs: optionalNumber })}
            placeholder="0"
            disabled={isPending}
          />
        </FormField>
      </div>
    </FormDialog>
  );
}
