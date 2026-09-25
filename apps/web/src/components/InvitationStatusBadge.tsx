import { Badge } from "@/components/ui/badge";

const VARIANTS = {
  PENDING: "warning",
  ACCEPTED: "success",
  EXPIRED: "secondary",
  REVOKED: "error",
} as const;

export function InvitationStatusBadge({ status }: { status: string }) {
  const variant = VARIANTS[status as keyof typeof VARIANTS] ?? "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}
