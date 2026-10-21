/**
 * ExamProctor.ai — Public Landing Page
 * Accessible without authentication at "/".
 * Includes brand presentation, feature breakdown, examination workflow,
 * multi-stakeholder benefits, integrity policies, and top-right Sign In action.
 */

import { Link } from 'react-router-dom';
import {
  ShieldCheck, Eye, Smartphone, Users, UserX, WifiOff,
  FileText, CheckCircle2, ArrowRight, Lock, Laptop, Check,
} from 'lucide-react';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  return (
    <div className={styles.landingWrapper}>
      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <header className={styles.navbar}>
        <Link to="/" className={styles.brand}>
          <img
            src="/examproctor.ai_logo.png"
            alt="ExamProctor.ai"
            className={styles.brandLogoImg}
          />
          <span className={styles.brandText}>
            ExamProctor<span className={styles.brandAccent}>.ai</span>
          </span>
        </Link>

        <nav className={styles.navLinks} aria-label="Main navigation">
          <a href="#features" className={styles.navLink}>Capabilities</a>
          <a href="#workflow" className={styles.navLink}>Examination Flow</a>
          <a href="#stakeholders" className={styles.navLink}>Benefits</a>
          <a href="#integrity" className={styles.navLink}>Integrity Notice</a>
        </nav>

        <div className={styles.navActions}>
          <Link to="/login" className={styles.signInBtn} id="nav-btn-signin">
            <span>Sign In</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroTag}>
          <ShieldCheck size={14} />
          <span>Privacy-Preserving &amp; Offline-Resilient Examination Platform</span>
        </div>

        <h1 className={styles.heroTitle}>
          Academic Integrity Powered by Browser-Local Computer Vision
        </h1>

        <p className={styles.heroSubtitle}>
          ExamProctor.ai performs continuous, non-intrusive proctoring entirely on the candidate’s device.
          No live webcam streams are uploaded to external cloud APIs, while a deterministic offline-first
          protocol ensures zero lost answers during unexpected network interruptions.
        </p>

        <div className={styles.heroCtaGroup}>
          <Link to="/login" className={styles.primaryCta} id="hero-btn-getstarted">
            <span>Access Platform</span>
            <ArrowRight size={18} />
          </Link>
          <a href="#features" className={styles.secondaryCta}>
            <span>View Technical Features</span>
          </a>
        </div>

        <div className={styles.metricsPillRow}>
          <div className={styles.metricPill}>
            <CheckCircle2 size={16} className={styles.checkIcon} />
            <span>Zero Video Cloud Uploads</span>
          </div>
          <div className={styles.metricPill}>
            <CheckCircle2 size={16} className={styles.checkIcon} />
            <span>100% Offline Exam Continuity</span>
          </div>
          <div className={styles.metricPill}>
            <CheckCircle2 size={16} className={styles.checkIcon} />
            <span>Deterministic Sync Engine</span>
          </div>
        </div>
      </section>

      {/* ── Capabilities / Feature Cards ──────────────────────────────────── */}
      <section id="features" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionPre}>Technical Architecture</div>
          <h2 className={styles.sectionTitle}>Precision Proctored Monitoring</h2>
          <p className={styles.sectionDesc}>
            Algorithms operate locally in WebAssembly, evaluating candidate visual conditions without
            interrupting student focus or streaming private video to third-party servers.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {/* Card 1 */}
          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconBlue}`}>
              <Smartphone size={22} />
            </div>
            <h3 className={styles.featureTitle}>Phone Presence Observation</h3>
            <p className={styles.featureText}>
              COCO-trained object detection identifies cell phones in frame. Provisional candidate
              snapshots are captured at frame 1 and confirmed through temporal persistence.
            </p>
          </div>

          {/* Card 2 */}
          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconOrange}`}>
              <Users size={22} />
            </div>
            <h3 className={styles.featureTitle}>Multiple Faces Detection</h3>
            <p className={styles.featureText}>
              MediaPipe facial landmarks detect when unauthorized collaborators enter camera range,
              capturing high-resolution visual evidence for professor verification.
            </p>
          </div>

          {/* Card 3 */}
          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconGreen}`}>
              <UserX size={22} />
            </div>
            <h3 className={styles.featureTitle}>Face-Absence Grace Periods</h3>
            <p className={styles.featureText}>
              Configurable duration thresholds distinguish innocent short glances or momentary posture
              changes from continuous unmonitored examination room absence.
            </p>
          </div>

          {/* Card 4 */}
          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconBlue}`}>
              <Eye size={22} />
            </div>
            <h3 className={styles.featureTitle}>Sustained Head Turn</h3>
            <p className={styles.featureText}>
              Calculates 3D yaw and pitch from facial transformation matrixes against a calibrated baseline,
              logging persistent gaze diversion away from the examination window.
            </p>
          </div>

          {/* Card 5 */}
          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconOrange}`}>
              <WifiOff size={22} />
            </div>
            <h3 className={styles.featureTitle}>Offline Exam Continuity</h3>
            <p className={styles.featureText}>
              IndexedDB outbox persistence records student responses and proctoring telemetry locally.
              The exam proceeds smoothly even during full Wi-Fi failure.
            </p>
          </div>

          {/* Card 6 */}
          <div className={styles.featureCard}>
            <div className={`${styles.featureIcon} ${styles.iconGreen}`}>
              <FileText size={22} />
            </div>
            <h3 className={styles.featureTitle}>ReportLab Verified PDF Reports</h3>
            <p className={styles.featureText}>
              Official reports embed actual stored JPEG snapshot evidence verified with SHA-256 checksums,
              complete with video-relative timestamps and observation timelines.
            </p>
          </div>
        </div>
      </section>

      {/* ── Step-by-Step Workflow ─────────────────────────────────────────── */}
      <section id="workflow" className={styles.section} style={{ background: 'var(--color-surface)', borderTop: 'var(--border-base)', borderBottom: 'var(--border-base)' }}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionPre}>End-to-End Execution</div>
          <h2 className={styles.sectionTitle}>Examination Lifecycle Workflow</h2>
          <p className={styles.sectionDesc}>
            From readiness verification to final human review, every stage is designed for fairness,
            resilience, and auditability.
          </p>
        </div>

        <div className={styles.workflowGrid}>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>1</div>
            <h3 className={styles.stepTitle}>Readiness Check</h3>
            <p className={styles.stepText}>
              Student verifies camera permissions, network reachability, and baseline facial calibration before starting.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>2</div>
            <h3 className={styles.stepTitle}>Local Attempt Start</h3>
            <p className={styles.stepText}>
              The exam package and questions load into local browser storage with strict deadline synchronization.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>3</div>
            <h3 className={styles.stepTitle}>Continuous Observation</h3>
            <p className={styles.stepText}>
              MediaPipe vision tasks evaluate sampled frames locally. Only confirmed episodes trigger representative snapshots.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>4</div>
            <h3 className={styles.stepTitle}>Gap-Free Sync</h3>
            <p className={styles.stepText}>
              Outbox worker sequentially dispatches answers and events, verifying server sequence numbers before finalization.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>5</div>
            <h3 className={styles.stepTitle}>Contextual Review</h3>
            <p className={styles.stepText}>
              Professors inspect timeline metrics and real embedded visual evidence to make informed human determinations.
            </p>
          </div>
        </div>
      </section>

      {/* ── Multi-Stakeholder Benefits ────────────────────────────────────── */}
      <section id="stakeholders" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionPre}>Designed for Institutions</div>
          <h2 className={styles.sectionTitle}>Built for Students, Faculty &amp; Admins</h2>
        </div>

        <div className={styles.stakeholderGrid}>
          <div className={styles.stakeholderCard}>
            <div className={styles.stakeholderRole}>For Students</div>
            <ul className={styles.benefitList}>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Zero exam loss when device's Wi-Fi disconnects.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Webcam video is never streamed to third parties.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Transparent honest status badges during sync.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Camera enlargement overlay for self-framing.</span>
              </li>
            </ul>
          </div>

          <div className={styles.stakeholderCard}>
            <div className={styles.stakeholderRole}>For Professors</div>
            <ul className={styles.benefitList}>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Verified PDF reports with actual embedded JPEG evidence.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Dedicated Recorded-Video Analysis tool with playback.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Live real-time examination monitoring dashboard.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Single-click retake granting and attempt controls.</span>
              </li>
            </ul>
          </div>

          <div className={styles.stakeholderCard}>
            <div className={styles.stakeholderRole}>For Administrators.</div>
            <ul className={styles.benefitList}>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Deterministic hash-chained outbox synchronization.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Cloud PostgreSQL architecture with strict RBAC.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Audit logging of all administrative actions.</span>
              </li>
              <li className={styles.benefitItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>Automated student USN uppercase normalization.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Integrity Policy / Disclaimer ─────────────────────────────────── */}
      <section id="integrity" className={styles.section} style={{ paddingTop: 0 }}>
        <div style={{ background: 'var(--color-orange-light)', border: '1.5px solid var(--color-orange)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-text-heading)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Lock size={18} style={{ color: 'var(--color-orange)' }} />
            <span>Academic Integrity &amp; Responsible AI Statement</span>
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', lineHeight: 1.6, margin: 0 }}>
            Automated computer-vision detections generated by ExamProctor.ai describe observable visual conditions
            (such as candidate device absence, phone presence, or head rotation). These automated signals represent
            technical observations only and do not constitute definitive proof of academic dishonesty or cheating.
            ExamProctor.ai upholds student dignity by mandating appropriate human review and contextual evaluation
            before any disciplinary action is taken.
          </p>
        </div>
      </section>

      {/* ── Professional Footer ───────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <img
                src="/examproctor.ai_logo.png"
                alt="ExamProctor.ai"
                className={styles.brandLogoImg}
                style={{ width: 28, height: 28 }}
              />
              <strong style={{ color: 'var(--color-text-heading)', fontSize: 'var(--font-size-md)' }}>
                ExamProctor.ai
              </strong>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
              &copy; {new Date().getFullYear()} ExamProctor.ai Platform. All rights reserved.
            </p>
          </div>

          <div className={styles.disclaimerBox}>
            Operates with browser-local MediaPipe Tasks Vision WebAssembly inference and secure cloud synchronization.
            Compatible with institutional learning management workflows.
          </div>
        </div>
      </footer>
    </div>
  );
}
