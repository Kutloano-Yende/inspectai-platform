import Link from "next/link";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import { Reveal } from "./Reveal";
import styles from "./FinalCTA.module.css";

export function FinalCTA() {
  return (
    <section className={styles.section} aria-labelledby="final-cta-heading">
      <div className={styles.container}>
        <Reveal className={styles.card}>
          <div>
            <h2 id="final-cta-heading">Make every inspection easier to prove.</h2>
            <p>Give landlords and tenants a clearer way to capture, review and understand property condition.</p>
          </div>

          <div className={styles.actions}>
            <Link href="/login" className={styles.primary}>
              Get started
              <HugeIcon icon={ArrowRight02Icon} size={15} />
            </Link>
            <Link href="/login" className={styles.secondary}>
              Sign in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
