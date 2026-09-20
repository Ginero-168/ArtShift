import type { CSSProperties, HTMLAttributes } from "react";
import styles from "./ArtShiftLogo.module.css";

export const ARTSHIFT_WORDMARK = "ArtShift";

export type ArtShiftLogoSize = "hero" | "header" | "compact";

type ArtShiftLogoProps = {
  as?: "div" | "span" | "h1" | "p";
  size?: ArtShiftLogoSize;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className" | "style">;

const SIZE_CLASS: Record<ArtShiftLogoSize, string> = {
  hero: styles.sizeHero,
  header: styles.sizeHeader,
  compact: styles.sizeCompact,
};

/** Shared Portal-styled ArtShift wordmark. Size via `size` or `--logo-size`. */
export default function ArtShiftLogo({
  as: Tag = "span",
  size = "header",
  className,
  style,
  ...rest
}: ArtShiftLogoProps) {
  const classes = [styles.root, SIZE_CLASS[size], className].filter(Boolean).join(" ");

  return (
    <Tag className={classes} style={style} {...rest}>
      <span className="fx-portal" data-text="ArtShift">
        ArtShift
      </span>
    </Tag>
  );
}
