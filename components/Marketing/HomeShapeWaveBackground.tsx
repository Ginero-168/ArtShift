"use client";

/**
 * Homepage Shape Wave background.
 * Inspired by CodePen yyapzOP / donotfold (https://codepen.io/donotfold/pen/yyapzOP).
 */

import { useEffect, useRef } from "react";
import { attachShapeWave, prefersReducedMotion } from "@/lib/marketing/shapeWave";
import styles from "./HomeShapeWaveBackground.module.css";

export default function HomeShapeWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let handle = attachShapeWave(canvas, { reducedMotion: prefersReducedMotion() });

    const onMotionChange = () => {
      handle.stop();
      handle = attachShapeWave(canvas, { reducedMotion: motionQuery.matches });
    };
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      motionQuery.removeEventListener("change", onMotionChange);
      handle.stop();
    };
  }, []);

  return (
    <div className={styles.layer} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} data-testid="home-shape-wave" />
    </div>
  );
}
