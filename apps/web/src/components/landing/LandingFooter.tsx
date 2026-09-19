import Link from "next/link";
import styles from "./LandingFooter.module.css";

const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "For Landlords", href: "#landlord-review" },
  { label: "For Tenants", href: "#for-tenants" },
  { label: "Security", href: "#security" },
];

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.top}>
          <div>
            <div className={styles.brand}>
              <svg className={styles.brandMark} viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" strokeWidth="2.2" />
                <path d="M11 16.5L14.3 19.8L21 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              InspectAI
            </div>
            <p className={styles.tagline}>Evidence first. Decisions stay human.</p>
          </div>

          <nav className={styles.nav} aria-label="Footer">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
            <Link href="/login">Sign in</Link>
          </nav>
        </div>

        <div className={styles.bottom}>
          <span>© InspectAI</span>
          <span className={styles.credit}>
            <a href="https://storyset.com/home">Home illustrations by Storyset</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
