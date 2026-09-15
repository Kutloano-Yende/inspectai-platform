"use client";

import { useForm } from "react-hook-form";
import { useCreateTenancy } from "@/lib/hooks/usePortfolio";
import { CreateTenancyRequest } from "@inspectai/contracts";
import styles from "./CreateTenancyModal.module.css";

interface CreateTenancyModalProps {
  unitId: string;
  onClose: () => void;
}

export function CreateTenancyModal({ unitId, onClose }: CreateTenancyModalProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateTenancyRequest>({
    defaultValues: {
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
    },
  });

  const { mutate: createTenancy, isPending, error } = useCreateTenancy(unitId);

  const onSubmit = (data: CreateTenancyRequest) => {
    createTenancy(data, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Create Tenancy</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="startDate">Start Date *</label>
            <input
              id="startDate"
              type="date"
              {...register("startDate", { required: "Start date is required" })}
              disabled={isPending}
            />
            {errors.startDate && <span className={styles.error}>{errors.startDate.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="endDate">End Date</label>
            <input
              id="endDate"
              type="date"
              {...register("endDate")}
              disabled={isPending}
            />
            <span className={styles.hint}>Leave blank for open-ended tenancy</span>
          </div>

          {error && <div className={styles.errorAlert}>{error.message}</div>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? "Creating..." : "Create Tenancy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
