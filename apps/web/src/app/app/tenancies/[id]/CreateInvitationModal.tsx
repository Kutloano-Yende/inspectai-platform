"use client";

import { useForm } from "react-hook-form";
import { useCreateInvitation } from "@/lib/hooks/usePortfolio";
import { CreateInvitationRequest } from "@inspectai/contracts";
import styles from "./CreateInvitationModal.module.css";

interface CreateInvitationModalProps {
  tenancyId: string;
  onClose: () => void;
}

export function CreateInvitationModal({ tenancyId, onClose }: CreateInvitationModalProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateInvitationRequest>({
    defaultValues: {
      tenantEmail: "",
      tenantFullName: "",
      tenantPhone: "",
    },
  });

  const { mutate: createInvitation, isPending, error, data } = useCreateInvitation(tenancyId);

  const onSubmit = (data: CreateInvitationRequest) => {
    createInvitation(data, {
      onSuccess: () => {
        reset();
        // onClose();
      },
    });
  };

  if (data) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <h2>Invitation Created</h2>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div className={styles.successContent}>
            <div className={styles.successIcon}>✓</div>
            <p className={styles.successText}>Invitation sent successfully!</p>

            <div className={styles.tokenBox}>
              <label>Invitation Token</label>
              <p className={styles.tokenValue}>{data.invitationToken}</p>
              <p className={styles.tokenHint}>Share this token with the tenant or copy it to send via email.</p>
            </div>

            <button className={styles.doneBtn} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Invite Tenant</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="tenantFullName">Tenant Name *</label>
            <input
              id="tenantFullName"
              {...register("tenantFullName", { required: "Tenant name is required" })}
              placeholder="John Doe"
              disabled={isPending}
            />
            {errors.tenantFullName && <span className={styles.error}>{errors.tenantFullName.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="tenantEmail">Email *</label>
            <input
              id="tenantEmail"
              type="email"
              {...register("tenantEmail", { required: "Email is required" })}
              placeholder="tenant@example.com"
              disabled={isPending}
            />
            {errors.tenantEmail && <span className={styles.error}>{errors.tenantEmail.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="tenantPhone">Phone</label>
            <input
              id="tenantPhone"
              {...register("tenantPhone")}
              placeholder="+27 (optional)"
              disabled={isPending}
            />
          </div>

          {error && <div className={styles.errorAlert}>{error.message}</div>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
