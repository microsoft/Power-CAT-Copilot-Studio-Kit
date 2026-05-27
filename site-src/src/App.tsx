import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Badge,
  Button,
  Subtitle1,
  Subtitle2,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowRightRegular,
  Beaker24Regular,
  BookOpenRegular,
  ChartMultipleRegular,
  ChatRegular,
  CheckmarkCircleRegular,
  Code24Regular,
  CubeMultipleRegular,
  DataTrending24Regular,
  Document24Regular,
  DocumentMultipleRegular,
  DocumentTableRegular,
  DocumentTextRegular,
  DismissRegular,
  Flash24Regular,
  Flow24Regular,
  Grid24Regular,
  Open16Regular,
  PuzzlePieceRegular,
  Rocket24Regular,
  RocketRegular,
  Search24Regular,
  ServerRegular,
  ShieldCheckmark24Regular,
  Sparkle24Regular,
} from "@fluentui/react-icons";
import {
  fontFamily,
  glassShadow,
  gradientBar,
  gradientHeroLayered,
  gradientText,
  palette,
} from "./theme";
import { features, pillarColor } from "./features";

const GITHUB_URL = "https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit";
const DOCS_URL =
  "https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/copilot-studio-kit-overview";
const WEBCHAT_URL =
  "https://copilotstudio.microsoft.com/environments/e8beebfd-6bb9-ecb9-8c64-45cbf5704fdc/bots/cat_copilotStudioKitHelper/webchat?__version__=2";
const ARCHETYPE_FRAMEWORK_URL =
  "https://learn.microsoft.com/en-us/agents/agent-archetypes/framework-apply";

const useStyles = makeStyles({
  /* --------------------------- Layout primitives --------------------------- */
  page: {
    minHeight: "100vh",
    backgroundColor: palette.white,
    color: palette.textPrimary,
    fontFamily,
  },
  // The signature 4-5px rainbow line that sits flush against the top of the
  // page and reappears below every section header on adoption.microsoft.com.
  gradientBar: {
    height: "5px",
    width: "100%",
    backgroundImage: gradientBar,
  },
  // White, blurred, fixed nav matches the adoption.microsoft.com pattern.
  nav: {
    position: "fixed",
    top: "5px",
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    borderBottom: `1px solid ${palette.border}`,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
  },
  navInner: {
    maxWidth: "1200px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: "32px",
    paddingRight: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },
  navLogo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontWeight: 700,
    fontSize: "16px",
    color: palette.textPrimary,
    textDecoration: "none",
    fontFamily,
  },
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: "28px",
  },
  navLink: {
    color: palette.textSecondary,
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 600,
    ":hover": { color: palette.textPrimary },
  },
  navLinksMobileHide: {
    "@media(max-width: 760px)": { display: "none" },
  },
  container: {
    maxWidth: "1200px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: "32px",
    paddingRight: "32px",
    "@media(max-width: 600px)": {
      paddingLeft: "20px",
      paddingRight: "20px",
    },
  },

  /* ------------------------------- Sections ------------------------------- */
  // Hero: predominantly white with very low-opacity painterly tints in the
  // corners — mirrors adoption.microsoft.com's `copilot-bg.png` which reads
  // as a nearly-white background with subtle pastel washes.
  hero: {
    position: "relative",
    backgroundColor: palette.white,
    backgroundImage:
      "radial-gradient(ellipse 900px 520px at 12% 18%, rgba(229, 216, 234, 0.32) 0%, transparent 65%), " +
      "radial-gradient(ellipse 800px 520px at 92% 82%, rgba(241, 232, 225, 0.48) 0%, transparent 65%)",
    paddingTop: "140px",
    paddingBottom: "60px",
    textAlign: "center",
    overflow: "hidden",
  },
  heroAfterBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: "5px",
    width: "100%",
    backgroundImage: gradientBar,
  },
  heroInner: {
    maxWidth: "900px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: "32px",
    paddingRight: "32px",
  },
  heroEyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "16px",
    lineHeight: "24px",
    fontWeight: 600,
    color: palette.textSecondary,
    marginBottom: "20px",
  },
  heroTitle: {
    margin: 0,
    fontFamily,
    fontSize: "clamp(2.5rem, 6vw, 4rem)",
    lineHeight: 1.08,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: palette.textPrimary,
  },
  heroTitleGradient: {
    backgroundImage: gradientHeroLayered,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  },
  heroSubtitle: {
    marginTop: "24px",
    fontSize: "22px",
    lineHeight: "32px",
    color: palette.textSecondary,
    maxWidth: "720px",
    marginLeft: "auto",
    marginRight: "auto",
  },
  heroCta: {
    display: "flex",
    gap: "12px",
    marginTop: "36px",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
    marginTop: "56px",
    "@media(max-width: 760px)": {
      gridTemplateColumns: "repeat(2, 1fr)",
    },
  },
  // "Glass card" — adoption.microsoft.com .single-prompt look: white,
  // 20px radius, very soft shadow, no heavy border.
  glassCard: {
    backgroundColor: palette.white,
    borderRadius: "20px",
    boxShadow: glassShadow,
    padding: "24px",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    ":hover": {
      transform: "translateY(-2px)",
      boxShadow:
        "0 0 0.125rem rgba(0, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, 0.10)",
    },
  },
  heroStatCard: {
    textAlign: "left",
  },
  heroStatIcon: {
    fontSize: "26px",
    marginBottom: "10px",
  },
  heroStatLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  heroStatValue: {
    fontSize: "1.5rem",
    fontWeight: 800,
    marginTop: "4px",
  },

  section: {
    paddingTop: "80px",
    paddingBottom: "80px",
    position: "relative",
  },
  sectionCream: { backgroundColor: palette.cream },
  sectionDusty: { backgroundColor: palette.dusty },
  sectionWhite: { backgroundColor: palette.white },
  sectionCenter: { textAlign: "center" },
  sectionEyebrow: {
    display: "inline-block",
    color: palette.textSecondary,
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: "12px",
  },
  sectionTitle: {
    margin: 0,
    fontFamily,
    fontSize: "clamp(2rem, 4vw, 2.75rem)",
    lineHeight: 1.18,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: palette.textPrimary,
  },
  sectionSubtitle: {
    marginTop: "16px",
    fontSize: "18px",
    lineHeight: "28px",
    color: palette.textSecondary,
    maxWidth: "780px",
  },
  sectionSubtitleCenter: {
    marginLeft: "auto",
    marginRight: "auto",
  },
  // The thin 2px rainbow rule used between blocks on adoption.microsoft.com.
  sectionRule: {
    height: "2px",
    width: "100%",
    backgroundImage: gradientBar,
    marginTop: "12px",
    marginBottom: "12px",
    opacity: 0.85,
  },
  sectionHeaderCenter: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "48px",
  },

  /* -------------------------- Cards & content grids -------------------------- */
  cardGrid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: "20px",
    marginTop: "32px",
  },
  cardGrid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "20px",
    marginTop: "32px",
  },
  pillarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "20px",
    marginTop: "32px",
  },
  featureCard: {
    backgroundColor: palette.white,
    borderRadius: "20px",
    boxShadow: glassShadow,
    padding: "28px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    ":hover": {
      transform: "translateY(-3px)",
      boxShadow:
        "0 0 0.125rem rgba(0, 0, 0, 0.15), 0 10px 30px rgba(0, 0, 0, 0.10)",
    },
  },
  featureCardIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.creamRich,
    color: palette.pillarQuality,
    fontSize: "24px",
  },
  featureCardTitle: {
    fontWeight: 700,
    fontSize: "18px",
    color: palette.textPrimary,
  },
  featureCardDesc: {
    fontSize: "15px",
    lineHeight: "22px",
    color: palette.textSecondary,
  },
  pillarCard: {
    position: "relative",
    backgroundColor: palette.white,
    borderRadius: "20px",
    boxShadow: glassShadow,
    padding: "28px",
    paddingTop: "32px",
    overflow: "hidden",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    ":hover": {
      transform: "translateY(-3px)",
      boxShadow:
        "0 0 0.125rem rgba(0, 0, 0, 0.15), 0 10px 30px rgba(0, 0, 0, 0.10)",
    },
  },
  pillarBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "4px",
  },
  pillarIcon: {
    fontSize: "36px",
    marginBottom: "12px",
  },

  /* ------------------------- Agent Archetype callout ------------------------- */
  /* Sits inside the Components section, above the card grid. Explains that the
   * components map onto the 3Cs framework (Categories, Capabilities, Components)
   * and links out to the published guidance on learn.microsoft.com.
   */
  archetypeCallout: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    columnGap: "24px",
    rowGap: "16px",
    backgroundColor: palette.white,
    border: `1px solid ${palette.border}`,
    borderRadius: "20px",
    boxShadow: glassShadow,
    padding: "24px 28px",
    paddingLeft: "32px",
    marginTop: "32px",
    marginBottom: "8px",
    overflow: "hidden",
    "@media(max-width: 760px)": {
      gridTemplateColumns: "1fr",
      paddingLeft: "24px",
      paddingTop: "28px",
    },
  },
  archetypeCalloutBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "5px",
    backgroundImage: gradientBar,
  },
  archetypeCalloutIcon: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.creamRich,
    color: palette.pillarQuality,
    fontSize: "28px",
    flexShrink: 0,
  },
  archetypeCalloutBody: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  archetypeCalloutEyebrow: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: palette.pillarQuality,
  },
  archetypeCalloutTitle: {
    fontSize: "20px",
    fontWeight: 700,
    lineHeight: "26px",
    color: palette.textPrimary,
  },
  archetypeCalloutText: {
    fontSize: "14.5px",
    lineHeight: "22px",
    color: palette.textSecondary,
    maxWidth: "640px",
  },
  archetypeCalloutHighlight: {
    fontWeight: 600,
    color: palette.textPrimary,
  },
  archetypeCalloutCta: {
    flexShrink: 0,
  },

  /* ------------------------------- Features table ------------------------------- */
  featureTableWrap: {
    backgroundColor: palette.white,
    borderRadius: "20px",
    boxShadow: glassShadow,
    overflow: "hidden",
    marginTop: "32px",
  },
  featureTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily,
  },
  featureTableHead: {
    backgroundColor: palette.creamRich,
    "& th": {
      textAlign: "left",
      fontSize: "12px",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: palette.textMuted,
      padding: "16px 20px",
      borderBottom: `1px solid ${palette.border}`,
    },
  },
  featureTableRow: {
    "& td": {
      padding: "16px 20px",
      borderBottom: `1px solid ${palette.border}`,
      fontSize: "14.5px",
      lineHeight: "22px",
      color: palette.textSecondary,
      verticalAlign: "top",
    },
    ":last-child td": { borderBottom: "none" },
    ":hover": {
      backgroundColor: palette.creamSoft,
    },
  },
  featureTableName: {
    fontWeight: 700,
    color: palette.textPrimary,
    whiteSpace: "nowrap",
  },

  /* -------------------------------- Get started -------------------------------- */
  flowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "20px",
    marginTop: "40px",
    "@media(max-width: 760px)": {
      gridTemplateColumns: "1fr",
    },
  },
  stepCard: {
    backgroundColor: palette.white,
    borderRadius: "20px",
    boxShadow: glassShadow,
    padding: "32px 28px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    textAlign: "left",
    position: "relative",
  },
  stepNumber: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    color: palette.white,
    fontWeight: 800,
    fontSize: "18px",
    marginBottom: "8px",
  },

  /* ----------------------------------- CTA ----------------------------------- */
  ctaSection: {
    position: "relative",
    paddingTop: "96px",
    paddingBottom: "96px",
    textAlign: "center",
    backgroundColor: palette.dusty,
    backgroundImage:
      "radial-gradient(ellipse 900px 600px at 20% 100%, rgba(241, 232, 225, 0.35) 0%, transparent 60%), " +
      "radial-gradient(ellipse 700px 500px at 90% 0%, rgba(255, 255, 255, 0.65) 0%, transparent 60%)",
  },

  /* ---------------------------------- Footer ---------------------------------- */
  footer: {
    backgroundColor: palette.white,
    borderTop: `1px solid ${palette.border}`,
    paddingTop: "32px",
    paddingBottom: "32px",
  },
  footerInner: {
    maxWidth: "1200px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: "32px",
    paddingRight: "32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  footerLinks: {
    display: "flex",
    gap: "28px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  footerLink: {
    color: palette.textSecondary,
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 600,
    ":hover": { color: palette.textPrimary, textDecoration: "underline" },
  },
  footerNote: {
    fontSize: "13px",
    color: palette.textMuted,
    textAlign: "center",
  },

  /* ------------------------------- Ask the Kit ------------------------------- */
  floatingChat: {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    zIndex: 200,
    borderRadius: "999px",
    boxShadow:
      "0 4px 12px rgba(0, 0, 0, 0.18), 0 12px 32px rgba(131, 61, 145, 0.30)",
  },
  chatPanel: {
    position: "fixed",
    right: "24px",
    bottom: "96px",
    zIndex: 200,
    width: "min(420px, calc(100vw - 48px))",
    height: "min(620px, calc(100vh - 140px))",
    backgroundColor: palette.white,
    borderRadius: "20px",
    boxShadow:
      "0 8px 24px rgba(0, 0, 0, 0.10), 0 20px 60px rgba(131, 61, 145, 0.18)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: `1px solid ${palette.border}`,
  },
  chatPanelHeader: {
    padding: "16px 20px",
    borderBottom: `1px solid ${palette.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    backgroundColor: palette.creamSoft,
  },
  chatPanelTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  chatPanelTitle: {
    display: "flex",
    flexDirection: "column",
  },
  chatPanelBody: { flex: 1, minHeight: 0 },
  chatIframe: { width: "100%", height: "100%", border: "none" },

  /* ------------------------------ Scroll reveal ------------------------------ *
   * Mirrors adoption.microsoft.com's `wpb_animate_when_almost_visible` pattern:
   * elements start at `opacity: 0` and slide/fade into place once they enter
   * the viewport. Implemented via IntersectionObserver in the <Reveal> wrapper.
   * Transition uses an ease-out cubic-bezier that approximates animate.css
   * `fadeInUp` (slight overshoot avoided to keep it tasteful on long pages).
   * ------------------------------------------------------------------------- */
  reveal: {
    opacity: 0,
    transitionProperty: "opacity, transform",
    transitionDuration: "700ms",
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "opacity, transform",
  },
  revealUp: { transform: "translate3d(0, 28px, 0)" },
  revealFade: { transform: "none" },
  revealLeft: { transform: "translate3d(-28px, 0, 0)" },
  revealRight: { transform: "translate3d(28px, 0, 0)" },
  revealScale: { transform: "scale(0.96)" },
  revealVisible: {
    opacity: 1,
    transform: "translate3d(0, 0, 0) scale(1)",
  },
});

/* ============================================================================
 *                          Scroll-reveal infrastructure
 *
 * `useReducedMotion` honors the OS-level accessibility preference; when set,
 * reveals trigger instantly without any transform/opacity transition. This is
 * the same pattern adoption.microsoft.com relies on (their WPBakery plugin
 * also gates its animation classes on user preferences).
 *
 * <Reveal> wraps a block, observes it via IntersectionObserver, and toggles
 * a `visible` class when the element first enters the viewport. It accepts:
 *   - `variant`: which initial transform to use (up, fade, left, right, scale)
 *   - `delay`:   ms before the transition starts — used to stagger siblings
 *                in grids so the cards "ripple" in from one corner.
 * The observer disconnects after first trigger so reveals don't replay when
 * the user scrolls back up. `rootMargin` is `-10%` on bottom so the reveal
 * fires while the element is still partially off-screen, which feels much
 * more responsive than waiting for full intersection.
 * ========================================================================== */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

type RevealVariant = "up" | "fade" | "left" | "right" | "scale";

function Reveal({
  children,
  variant = "up",
  delay = 0,
  className,
  as = "div",
  style,
  rootMargin = "0px 0px -10% 0px",
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "header" | "article" | "li" | "tr" | "span";
  style?: CSSProperties;
  rootMargin?: string;
}) {
  const s = useStyles();
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    // Some users land mid-page (e.g. via hash anchor) — fire immediately for
    // anything already in view rather than waiting for the next scroll tick.
    const rect = node.getBoundingClientRect();
    if (
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0
    ) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin, threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reducedMotion, rootMargin]);

  const variantClass =
    variant === "fade"
      ? s.revealFade
      : variant === "left"
      ? s.revealLeft
      : variant === "right"
      ? s.revealRight
      : variant === "scale"
      ? s.revealScale
      : s.revealUp;

  const Tag = as as React.ElementType;
  const mergedStyle: CSSProperties = {
    ...style,
    ...(delay && !visible ? { transitionDelay: `${delay}ms` } : {}),
  };
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      data-reveal={visible ? "in" : "out"}
      data-reveal-variant={variant}
      className={mergeClasses(
        s.reveal,
        variantClass,
        visible && s.revealVisible,
        className,
      )}
      style={mergedStyle}
    >
      {children}
    </Tag>
  );
}

/* ============================================================================
 *                                Section header
 * ========================================================================== */
function SectionHeader({
  eyebrow,
  title,
  highlight,
  subtitle,
  center,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  subtitle?: string;
  center?: boolean;
}) {
  const s = useStyles();
  return (
    <Reveal
      variant="up"
      className={center ? s.sectionHeaderCenter : undefined}
    >
      <span className={s.sectionEyebrow}>{eyebrow}</span>
      <h2 className={s.sectionTitle}>
        {title}
        {highlight ? (
          <>
            {" "}
            <span
              style={{
                backgroundImage: gradientText,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              {highlight}
            </span>
          </>
        ) : null}
      </h2>
      {/* the signature 2px rainbow rule sits directly under section titles */}
      <div
        className={s.sectionRule}
        style={center ? { maxWidth: "120px", marginLeft: "auto", marginRight: "auto", marginTop: "20px" } : { maxWidth: "120px", marginTop: "20px" }}
      />
      {subtitle ? (
        <p
          className={mergeClasses(
            s.sectionSubtitle,
            center ? s.sectionSubtitleCenter : undefined
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}

/* ============================================================================
 *                                    Page
 * ========================================================================== */
export default function App() {
  const s = useStyles();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className={s.page}>
      {/* Top rainbow accent (fixed) */}
      <div
        className={s.gradientBar}
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 101 }}
      />

      {/* ----------------------------- Top nav ----------------------------- */}
      <nav className={s.nav}>
        <div className={s.navInner}>
          <a href="#" className={s.navLogo}>
            <Sparkle24Regular style={{ color: palette.pillarQuality }} />
            Copilot Agent Kit
            <Badge
              appearance="outline"
              color="brand"
              size="small"
              style={{ marginLeft: "6px" }}
            >
              Free &amp; Open Source
            </Badge>
          </a>
          <div className={s.navLinks}>
            <a
              href="#pillars"
              className={mergeClasses(s.navLink, s.navLinksMobileHide)}
            >
              Pillars
            </a>
            <a
              href="#features"
              className={mergeClasses(s.navLink, s.navLinksMobileHide)}
            >
              Features
            </a>
            <a
              href="#components"
              className={mergeClasses(s.navLink, s.navLinksMobileHide)}
            >
              Components
            </a>
            <a
              href="#get-started"
              className={mergeClasses(s.navLink, s.navLinksMobileHide)}
            >
              Get Started
            </a>
            <Button
              as="a"
              {...{ href: GITHUB_URL, target: "_blank", rel: "noopener" }}
              appearance="outline"
              size="small"
              icon={<Code24Regular />}
            >
              GitHub
            </Button>
          </div>
        </div>
      </nav>

      {/* ------------------------------- Hero ------------------------------- */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <Reveal variant="up">
            <div className={s.heroEyebrow}>
              <Sparkle24Regular style={{ color: palette.pillarQuality }} />
              Free, open-source from Power CAT
            </div>
          </Reveal>
          <Reveal variant="up" delay={80}>
            <h1 className={s.heroTitle}>
              <span className={s.heroTitleGradient}>
                Accelerate your agent operations
                <br />
                at enterprise scale.
              </span>
            </h1>
          </Reveal>
          <Reveal variant="up" delay={180}>
            <p className={s.heroSubtitle}>
              A free, open-source toolkit that complements Microsoft Copilot
              Studio with enterprise-grade testing, analytics, governance, and
              reusable components — built and maintained by the Power Customer
              Advisory Team (Power CAT) as a gift to the community.
            </p>
          </Reveal>
          <Reveal variant="up" delay={260}>
            <div className={s.heroCta}>
              <Button
                as="a"
                {...{ href: GITHUB_URL, target: "_blank", rel: "noopener" }}
                appearance="primary"
                size="large"
                icon={<Code24Regular />}
              >
                View on GitHub
              </Button>
              <Button
                as="a"
                {...{ href: "#get-started" }}
                appearance="outline"
                size="large"
                icon={<RocketRegular />}
              >
                Quick Start
              </Button>
              <Button
                as="a"
                {...{ href: DOCS_URL, target: "_blank", rel: "noopener" }}
                appearance="subtle"
                size="large"
                icon={<DocumentTextRegular />}
              >
                Documentation
              </Button>
            </div>
          </Reveal>

          {/* Hero stats — 4 glass cards */}
          <div className={s.heroStats}>
            {[
              {
                icon: <Sparkle24Regular />,
                label: "Features",
                value: String(features.length),
                color: palette.pillarQuality,
              },
              {
                icon: <PuzzlePieceRegular />,
                label: "Components & Templates",
                value: "10",
                color: palette.pillarAnalytics,
              },
              {
                icon: <ServerRegular />,
                label: "Built On",
                value: "Dataverse",
                color: palette.pillarGovernance,
              },
              {
                icon: <CheckmarkCircleRegular />,
                label: "Free Add-On",
                value: "Open Source",
                color: "#EC4899",
              },
            ].map((stat, i) => (
              <Reveal
                key={stat.label}
                variant="up"
                delay={340 + i * 90}
                className={mergeClasses(s.glassCard, s.heroStatCard)}
              >
                <div className={s.heroStatIcon} style={{ color: stat.color }}>
                  {stat.icon}
                </div>
                <div className={s.heroStatLabel}>{stat.label}</div>
                <div className={s.heroStatValue} style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <div className={s.heroAfterBar} />
      </section>

      {/* --------------------------- Free Add-On --------------------------- */}
      <section className={mergeClasses(s.section, s.sectionWhite)}>
        <div className={s.container}>
          <SectionHeader
            eyebrow="Free Add-On"
            title="Free tools that complement your"
            highlight="agent platform."
            subtitle="Copilot Studio provides powerful native capabilities for building, testing, and monitoring agents. The Copilot Agent Kit is a free, open-source complement — additional tooling on top of Copilot Studio, not a replacement, designed for organizations managing agents at scale."
          />
          <div className={s.cardGrid3}>
            {[
              {
                icon: <ChartMultipleRegular />,
                title: "Cross-Agent Analytics",
                desc: "Copilot Studio provides per-agent analytics natively. The Copilot Agent Kit adds aggregated cross-agent KPIs in Dataverse, enabling org-wide dashboards and executive reporting across your entire agent portfolio.",
                color: palette.pillarAnalytics,
              },
              {
                icon: <Beaker24Regular />,
                title: "Batch Testing Workflows",
                desc: "Complement Copilot Studio's evaluation framework with Excel-based test management, LLM-graded scoring rubrics, and automated pipeline quality gates that block releases on failure.",
                color: palette.pillarQuality,
              },
              {
                icon: <ShieldCheckmark24Regular />,
                title: "Compliance Automation",
                desc: "Layer risk scoring, quarantine workflows, and structured review processes on top of Power Platform's existing governance controls — purpose-built for organizations with agent compliance requirements.",
                color: palette.pillarGovernance,
              },
            ].map((c, i) => (
              <Reveal
                key={c.title}
                variant="up"
                delay={i * 90}
                className={s.featureCard}
              >
                <div
                  className={s.featureCardIcon}
                  style={{ color: c.color, backgroundColor: hexToRgba(c.color, 0.10) }}
                >
                  {c.icon}
                </div>
                <div className={s.featureCardTitle}>{c.title}</div>
                <div className={s.featureCardDesc}>{c.desc}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- Pillars ----------------------------- */}
      <section
        id="pillars"
        className={mergeClasses(s.section, s.sectionCream)}
      >
        <div className={s.container}>
          <SectionHeader
            eyebrow="Four Pillars"
            title="One Kit."
            highlight="Four capabilities."
            subtitle="Every feature maps to one of these operational pillars — install only what your organization needs."
            center
          />
          <div className={s.pillarGrid}>
            {[
              {
                icon: <Beaker24Regular />,
                title: "Quality",
                desc: "Batch testing with LLM-graded evaluation, AI-generated rubrics, and automated pipeline quality gates.",
                color: palette.pillarQuality,
              },
              {
                icon: <ShieldCheckmark24Regular />,
                title: "Governance",
                desc: "Agent inventory enrichment, compliance risk scoring, quarantine workflows, and connector access control.",
                color: palette.pillarGovernance,
              },
              {
                icon: <ChartMultipleRegular />,
                title: "Analytics",
                desc: "Aggregated cross-agent KPIs, conversation analysis, ROI dashboards, and Application Insights integration.",
                color: palette.pillarAnalytics,
              },
              {
                icon: <PuzzlePieceRegular />,
                title: "Components",
                desc: "Reusable building blocks — document extraction, research pipelines, Word generation, and ServiceNow integration.",
                color: palette.pillarComponents,
              },
            ].map((p, i) => (
              <Reveal
                key={p.title}
                variant="up"
                delay={i * 80}
                className={s.pillarCard}
              >
                <div
                  className={s.pillarBar}
                  style={{ backgroundColor: p.color }}
                />
                <div className={s.pillarIcon} style={{ color: p.color }}>
                  {p.icon}
                </div>
                <div className={s.featureCardTitle}>{p.title}</div>
                <div className={s.featureCardDesc}>{p.desc}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- Features ----------------------------- */}
      <section
        id="features"
        className={mergeClasses(s.section, s.sectionDusty)}
      >
        <div className={s.container}>
          <SectionHeader
            eyebrow="Features"
            title={`${features.length} features.`}
            highlight="All open source."
            subtitle="Each feature is independently installable via the Kit Store — take what you need, leave what you don't."
          />
          <Reveal variant="up" delay={120}>
            <div className={s.featureTableWrap}>
              <table className={s.featureTable}>
                <thead className={s.featureTableHead}>
                  <tr>
                    <th style={{ width: "26%" }}>Feature</th>
                    <th>Description</th>
                    <th style={{ width: "14%" }}>Pillar</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f.name} className={s.featureTableRow}>
                      <td className={s.featureTableName}>{f.name}</td>
                      <td>{f.desc}</td>
                      <td>
                        <Badge
                          appearance="tint"
                          size="medium"
                          style={{
                            backgroundColor: hexToRgba(pillarColor[f.pillar], 0.12),
                            color: pillarColor[f.pillar],
                            border: `1px solid ${hexToRgba(pillarColor[f.pillar], 0.30)}`,
                          }}
                        >
                          {f.pillar}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------- Components ----------------------------- */}
      <section
        id="components"
        className={mergeClasses(s.section, s.sectionWhite)}
      >
        <div className={s.container}>
          <SectionHeader
            eyebrow="Components"
            title="Reusable building blocks for"
            highlight="any agent."
            subtitle="Drop these into your Copilot Studio agents. Each component is a self-contained module with topics, flows, and connectors ready to use."
          />
          <Reveal variant="up" className={s.archetypeCallout}>
            <div className={s.archetypeCalloutBar} aria-hidden="true" />
            <div className={s.archetypeCalloutIcon} aria-hidden="true">
              <CubeMultipleRegular />
            </div>
            <div className={s.archetypeCalloutBody}>
              <div className={s.archetypeCalloutEyebrow}>
                Grounded in the framework
              </div>
              <div className={s.archetypeCalloutTitle}>
                Built on the Agent Archetype Framework
              </div>
              <div className={s.archetypeCalloutText}>
                Every component below is a concrete expression of the{" "}
                <span className={s.archetypeCalloutHighlight}>3Cs model</span>
                {" — "}
                <span className={s.archetypeCalloutHighlight}>Categories</span>
                {" (the "}<em>why</em>
                {"), "}
                <span className={s.archetypeCalloutHighlight}>Capabilities</span>
                {" (the "}<em>what</em>
                {"), and "}
                <span className={s.archetypeCalloutHighlight}>Components</span>
                {" (the "}<em>how</em>
                {"). Document Extraction, Research, Executive Brief and the rest map directly to the framework's Connect, Analyze, Create and Automate categories — so you can ship a pattern once and reuse it as organizational knowledge."}
              </div>
            </div>
            <div className={s.archetypeCalloutCta}>
              <Button
                as="a"
                {...{
                  href: ARCHETYPE_FRAMEWORK_URL,
                  target: "_blank",
                  rel: "noopener noreferrer",
                }}
                appearance="primary"
                size="medium"
                icon={<Open16Regular />}
                iconPosition="after"
              >
                Apply the framework
              </Button>
            </div>
          </Reveal>
          <div className={s.cardGrid2}>
            {[
              {
                icon: <Document24Regular />,
                title: "Document Extraction",
                desc: "AI Builder-powered pipeline that converts uploaded documents into structured data your agent can reason over.",
              },
              {
                icon: <Search24Regular />,
                title: "Research Module",
                desc: "3-stage pipeline: plan → synthesize → finalize. Turns broad research questions into structured, sourced answers.",
              },
              {
                icon: <DataTrending24Regular />,
                title: "Executive Brief Module",
                desc: "3-stage pipeline that produces leadership-ready briefs from raw data — structured, concise, and actionable.",
              },
              {
                icon: <DocumentMultipleRegular />,
                title: "Word Document Generator",
                desc: "Converts Markdown agent output into downloadable .docx files via an Agent Flow with professional formatting.",
              },
              {
                icon: <Flow24Regular />,
                title: "ServiceNow Ticket Module",
                desc: "Full incident lifecycle — 5 topics + ServiceNow connector. Create, update, search, and resolve tickets from chat.",
              },
              {
                icon: <DocumentTableRegular />,
                title: "Row Filtering & Summarization",
                desc: "AI-powered tabular data filtering. Pass a table and a natural language query — get the relevant rows back.",
              },
            ].map((c, i) => (
              <Reveal
                key={c.title}
                variant="up"
                delay={(i % 3) * 90}
                className={s.featureCard}
              >
                <div
                  className={s.featureCardIcon}
                  style={{
                    color: palette.pillarComponents,
                    backgroundColor: hexToRgba(palette.pillarComponents, 0.12),
                  }}
                >
                  {c.icon}
                </div>
                <div className={s.featureCardTitle}>{c.title}</div>
                <div className={s.featureCardDesc}>{c.desc}</div>
                <Badge
                  appearance="outline"
                  size="small"
                  style={{ alignSelf: "flex-start", marginTop: "4px" }}
                >
                  Component
                </Badge>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- Get Started ----------------------------- */}
      <section
        id="get-started"
        className={mergeClasses(s.section, s.sectionCream)}
      >
        <div className={s.container}>
          <SectionHeader
            eyebrow="Get Started"
            title="Up and running in"
            highlight="30 minutes."
            subtitle="Install the Copilot Agent Kit solution, browse the Kit Store for features, and add free, open-source tooling on top of your Copilot Studio environment."
            center
          />
          <div className={s.flowGrid}>
            {[
              {
                num: "1",
                title: "Install Copilot Agent Kit",
                desc: "Import the managed solution into your Dataverse environment. The Kit Store appears as a model-driven app.",
                color: palette.pillarAnalytics,
              },
              {
                num: "2",
                title: "Pick Your Features",
                desc: "Browse the Kit Store and install only the features your team needs — testing, governance, analytics, or components.",
                color: palette.pillarGovernance,
              },
              {
                num: "3",
                title: "Configure & Go",
                desc: "Connect features to your agents, assign security roles, and start enhancing your agent operations.",
                color: palette.pillarComponents,
              },
            ].map((step, i) => (
              <Reveal
                key={step.num}
                variant="up"
                delay={i * 120}
                className={s.stepCard}
              >
                <div
                  className={s.stepNumber}
                  style={{ backgroundColor: step.color }}
                >
                  {step.num}
                </div>
                <div className={s.featureCardTitle}>{step.title}</div>
                <div className={s.featureCardDesc}>{step.desc}</div>
              </Reveal>
            ))}
          </div>
          <p
            className={mergeClasses(s.sectionSubtitle, s.sectionSubtitleCenter)}
            style={{ marginTop: "40px", textAlign: "center" }}
          >
            No external dependencies. No new infrastructure. Runs in the same
            Dataverse environment as your agents.
          </p>
        </div>
      </section>

      {/* -------------------------------- CTA -------------------------------- */}
      <section className={s.ctaSection}>
        <div className={s.container}>
          <Reveal variant="up">
            <span className={s.sectionEyebrow}>Extend Your Agents</span>
            <h2
              className={s.sectionTitle}
              style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)" }}
            >
              Take your agent operations
              <br />
              <span
                style={{
                  backgroundImage: gradientText,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextFillColor: "transparent",
                }}
              >
                to the next level.
              </span>
            </h2>
            <div
              className={s.sectionRule}
              style={{
                maxWidth: "120px",
                marginLeft: "auto",
                marginRight: "auto",
                marginTop: "20px",
              }}
            />
            <p
              className={mergeClasses(
                s.sectionSubtitle,
                s.sectionSubtitleCenter
              )}
              style={{ marginTop: "20px" }}
            >
              The Copilot Agent Kit gives your team free, open-source tools for
              testing, governance, and analytics — built to complement the
              platform you already use.
            </p>
          </Reveal>
          <Reveal variant="up" delay={150}>
            <div className={s.heroCta}>
              <Button
                as="a"
                {...{ href: GITHUB_URL, target: "_blank", rel: "noopener" }}
                appearance="primary"
                size="large"
                icon={<Code24Regular />}
              >
                View on GitHub
              </Button>
              <Button
                as="a"
                {...{ href: DOCS_URL, target: "_blank", rel: "noopener" }}
                appearance="outline"
                size="large"
                icon={<BookOpenRegular />}
              >
                Documentation
              </Button>
              <Button
                as="a"
                {...{
                  href: `${GITHUB_URL}/issues`,
                  target: "_blank",
                  rel: "noopener",
                }}
                appearance="subtle"
                size="large"
                icon={<ChatRegular />}
              >
                Community
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------ Footer ------------------------------ */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerLinks}>
            <a href={GITHUB_URL} className={s.footerLink}>
              GitHub
            </a>
            <a href={DOCS_URL} className={s.footerLink}>
              Docs
            </a>
            <a href={`${GITHUB_URL}/wiki`} className={s.footerLink}>
              Wiki
            </a>
            <a href={`${GITHUB_URL}/releases`} className={s.footerLink}>
              Releases
            </a>
          </div>
          <Text className={s.footerNote}>
            Copilot Agent Kit · Power CAT · Microsoft · Free &amp; Open Source
            under MIT License
          </Text>
        </div>
      </footer>

      {/* ------------------------- Ask the Kit (chat) ------------------------- */}
      {chatOpen && (
        <div className={s.chatPanel} role="dialog" aria-label="Ask the Kit">
          <div className={s.chatPanelHeader}>
            <div className={s.chatPanelTitleRow}>
              <Sparkle24Regular
                style={{ color: palette.pillarQuality, fontSize: "20px" }}
              />
              <div className={s.chatPanelTitle}>
                <Subtitle1>Ask the Kit</Subtitle1>
                <Subtitle2 style={{ color: palette.textMuted }}>
                  Copilot Agent Kit
                </Subtitle2>
              </div>
            </div>
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              onClick={() => setChatOpen(false)}
            >
              Close
            </Button>
          </div>
          <div className={s.chatPanelBody}>
            <iframe
              src={WEBCHAT_URL}
              title="Ask the Kit webchat"
              className={s.chatIframe}
            />
          </div>
        </div>
      )}

      <Button
        appearance="primary"
        className={s.floatingChat}
        icon={<ChatRegular />}
        onClick={() => setChatOpen((v) => !v)}
        aria-label={chatOpen ? "Close Ask the Kit chat" : "Open Ask the Kit chat"}
        title="Ask the Kit"
        style={{ backgroundColor: palette.pillarQuality }}
      >
        Ask the Kit
      </Button>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */
function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace("#", "");
  const bigint = parseInt(
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
