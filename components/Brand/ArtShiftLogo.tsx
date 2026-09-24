import type { CSSProperties, HTMLAttributes } from "react";
import styles from "./ArtShiftLogo.module.css";

export const ARTSHIFT_WORDMARK = "ArtShift";

export type ArtShiftLogoSize = "hero" | "header" | "compact";

type ArtShiftLogoProps = {
  as?: "div" | "span" | "h1" | "p";
  size?: ArtShiftLogoSize;
  /** Show the registration mark before the wordmark. */
  mark?: boolean;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className" | "style">;

const SIZE_CLASS: Record<ArtShiftLogoSize, string> = {
  hero: styles.sizeHero,
  header: styles.sizeHeader,
  compact: styles.sizeCompact,
};

/** Two squares printed slightly out of register — the "shift" in ArtShift. */
export function ArtShiftMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="2.5" width="13.5" height="13.5" fill="var(--logo-signal)" />
      <rect
        x="8"
        y="8"
        width="13.5"
        height="13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

/** Shared ArtShift wordmark. Size via `size` or `--logo-size`. */
export default function ArtShiftLogo({
  as: Tag = "span",
  size = "header",
  mark = true,
  className,
  style,
  ...rest
}: ArtShiftLogoProps) {
  const classes = [styles.root, SIZE_CLASS[size], className].filter(Boolean).join(" ");

  return (
    <Tag className={classes} style={style} {...rest}>
      {mark ? <ArtShiftMark className={styles.mark} /> : null}
      <span className={styles.wordmark}>
        <span className={styles.art}>Art</span>
        <span className={styles.shift}>Shift</span>
      </span>
    </Tag>
  );
}
