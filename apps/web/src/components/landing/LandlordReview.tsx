import { Search01Icon, ShieldUserIcon, Tick02Icon, Edit02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import { Reveal } from "./Reveal";
import styles from "./LandlordReview.module.css";

export function LandlordReview() {
  return (
    <section id="landlord-review" className={styles.section} aria-labelledby="landlord-review-heading">
      <div className={styles.container}>
        <Reveal className={styles.header}>
          <span className={styles.eyebrow}>FOR LANDLORDS</span>
          <h2 id="landlord-review-heading">You stay in control.</h2>
          <p>
            InspectAI can help surface observations from inspection evidence, but it does not determine
            damage, deductions or deposit outcomes. Every decision is made by the landlord.
          </p>
        </Reveal>

        <Reveal delayMs={100} className={styles.flow}>
          <div className={styles.flowCard}>
            <div className={styles.flowLabel}>
              <HugeIcon icon={Search01Icon} size={16} />
              AI observation — advisory only
            </div>
            <p className={styles.observation}>&ldquo;Wall surface appears to show marks.&rdquo;</p>
          </div>

          <div className={styles.flowConnector} aria-hidden="true">
            <span />
          </div>

          <div className={styles.flowCard}>
            <div className={styles.flowLabel}>
              <HugeIcon icon={ShieldUserIcon} size={16} />
              Landlord decision
            </div>

            {/* Illustrative only — not a functional control, so not a real <button> */}
            <div className={styles.decisionButtons} role="group" aria-label="Example landlord decision options">
              <span className={styles.accept}>
                <HugeIcon icon={Tick02Icon} size={16} />
                Accept
              </span>
              <span className={styles.amend}>
                <HugeIcon icon={Edit02Icon} size={16} />
                Amend
              </span>
              <span className={styles.reject}>
                <HugeIcon icon={Cancel01Icon} size={16} />
                Reject
              </span>
            </div>

            <p className={styles.finalNote}>The landlord&apos;s decision is final and explicitly recorded.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
