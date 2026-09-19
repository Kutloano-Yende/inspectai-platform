import Link from "next/link";
import { Building06Icon, Camera01Icon, Search01Icon, CheckmarkCircle02Icon, ArrowRight02Icon, PlayCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import styles from "./HeroSection.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.content}>
            <div className={styles.eyebrow}>
              <span aria-hidden="true" />
              CAPTURE. REVIEW. DECIDE.
            </div>

            <h1 id="hero-heading">
              Property inspections,
              <br />
              <span>without the paperwork.</span>
            </h1>

            <p className={styles.lead}>
              InspectAI helps landlords capture property condition evidence, review findings and keep a
              clear record of every inspection — from move-in to move-out.
            </p>

            <div className={styles.actions}>
              <Link href="/login" className={styles.primaryButton}>
                Get started
                <HugeIcon icon={ArrowRight02Icon} size={17} />
              </Link>
              <a href="#how-it-works" className={styles.secondaryButton}>
                <HugeIcon icon={PlayCircle02Icon} size={17} />
                See how it works
              </a>
            </div>
          </div>

          {/* Static product UI composition — visual only, not live data */}
          <div className={styles.mockupWrap} aria-hidden="true">
            <img
              src="/illustrations/house-searching.svg"
              alt=""
              className={styles.decorativeIllustration}
              width={220}
              height={220}
            />

            <div className={styles.laptop}>
              <div className={styles.laptopScreen}>
                <span className={styles.laptopCamera} />

                <div className={styles.mockup}>
                  <div className={styles.mockupTop}>
                    <div>
                      <span className={styles.miniLabel}>Property</span>
                      <strong>Oakwood Apartment</strong>
                    </div>
                    <span className={styles.statusBadge}>Under review</span>
                  </div>

                  <div className={styles.mockupSub}>
                    <HugeIcon icon={Building06Icon} size={15} />
                    <span>Move-out inspection</span>
                  </div>

                  <div className={styles.evidenceRow}>
                    <div className={`${styles.thumb} ${styles.thumbOne}`}>
                      <span>Living Room</span>
                    </div>
                    <div className={`${styles.thumb} ${styles.thumbTwo}`}>
                      <span>Kitchen</span>
                    </div>
                    <div className={`${styles.thumb} ${styles.thumbThree}`}>
                      <span>Bedroom</span>
                    </div>
                    <div className={`${styles.thumb} ${styles.thumbFour}`}>
                      <span>Bathroom</span>
                    </div>
                  </div>

                  <div className={styles.findingCard}>
                    <div className={styles.findingRow}>
                      <HugeIcon icon={Search01Icon} size={16} className={styles.findingIcon} />
                      <div>
                        <span className={styles.findingLabel}>AI observation — advisory only</span>
                        <strong>Wall surface appears to show marks.</strong>
                      </div>
                    </div>
                    <div className={styles.decisionRow}>
                      <HugeIcon icon={CheckmarkCircle02Icon} size={16} className={styles.decisionIcon} />
                      <span className={styles.decisionLabel}>Landlord decision</span>
                      <span className={styles.decisionValue}>Accepted</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.laptopBase} />
            </div>

            <div className={styles.floatingBadge}>
              <HugeIcon icon={Camera01Icon} size={16} />
              Evidence captured
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
