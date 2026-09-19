"use client";

import { useEffect, useRef, useState, type PropsWithChildren } from "react";

interface RevealProps extends PropsWithChildren {
  delayMs?: number;
  className?: string;
}

/**
 * Fades/slides content up as it enters the viewport.
 * Respects prefers-reduced-motion via the CSS on the consuming component
 * (each *.module.css defines the actual transition and its reduced-motion override).
 */
export function Reveal({ children, delayMs = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-visible={visible}
      className={className}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
