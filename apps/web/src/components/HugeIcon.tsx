import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface HugeIconProps {
  icon: IconSvgElement;
  size?: number;
  className?: string;
}

/** Thin wrapper keeping stroke weight and colour consistent across the landing page. */
export function HugeIcon({ icon, size = 22, className }: HugeIconProps) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.6} color="currentColor" className={className} />;
}
