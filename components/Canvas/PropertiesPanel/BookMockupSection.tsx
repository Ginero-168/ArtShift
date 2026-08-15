"use client";

import styles from "@/components/Builder/Builder.module.css";
import type { BookMockupElement } from "@/lib/engine/types";

const VIEW_PRESETS: Array<{
  label: string;
  patch: Partial<BookMockupElement>;
}> = [
  { label: "Front", patch: { yaw: 0, pitch: 0, roll: 0, perspective: 75 } },
  { label: "Left", patch: { yaw: 30, pitch: -8, roll: 0, perspective: 58 } },
  { label: "Right", patch: { yaw: -30, pitch: -8, roll: 0, perspective: 58 } },
  { label: "Editorial", patch: { yaw: 18, pitch: -18, roll: -7, perspective: 46 } },
];

export function BookMockupSection({
  mockup,
  apply,
}: {
  mockup: BookMockupElement;
  apply: (patch: Partial<BookMockupElement>, label: string) => void;
}) {
  return (
    <>
      <div className={styles.optionSection}>
        <h3>Camera</h3>
        <div className={styles.buttonRow}>
          {VIEW_PRESETS.map((preset) => (
            <button
              type="button"
              className={styles.secondaryButton}
              key={preset.label}
              onClick={() => apply(preset.patch, "mockup view")}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <MockupRange
          label="Yaw"
          value={mockup.yaw}
          min={-65}
          max={65}
          suffix="°"
          onChange={(yaw) => apply({ yaw }, "mockup yaw")}
        />
        <MockupRange
          label="Pitch"
          value={mockup.pitch}
          min={-45}
          max={45}
          suffix="°"
          onChange={(pitch) => apply({ pitch }, "mockup pitch")}
        />
        <MockupRange
          label="Roll"
          value={mockup.roll ?? 0}
          min={-45}
          max={45}
          suffix="°"
          onChange={(roll) => apply({ roll }, "mockup roll")}
        />
        <MockupRange
          label="Perspective"
          value={mockup.perspective ?? 58}
          min={20}
          max={120}
          onChange={(perspective) => apply({ perspective }, "mockup perspective")}
        />
      </div>
      <div className={styles.optionSection}>
        <h3>Construction</h3>
        <label className={styles.field}>
          <span>Binding</span>
          <select
            value={mockup.binding ?? "paperback"}
            onChange={(event) =>
              apply(
                { binding: event.currentTarget.value as BookMockupElement["binding"] },
                "mockup binding",
              )
            }
          >
            <option value="paperback">Paperback</option>
            <option value="hardcover">Hardcover</option>
          </select>
        </label>
        <MockupRange
          label="Thickness"
          value={mockup.depth}
          min={2}
          max={35}
          suffix="%"
          onChange={(depth) => apply({ depth }, "mockup depth")}
        />
        <MockupRange
          label="Cover edge"
          value={mockup.coverThickness ?? 1.2}
          min={0.2}
          max={5}
          step={0.1}
          suffix="%"
          onChange={(coverThickness) => apply({ coverThickness }, "cover thickness")}
        />
        {mockup.binding === "hardcover" ? (
          <MockupRange
            label="Overhang"
            value={mockup.coverOverhang ?? 1.8}
            min={0}
            max={6}
            step={0.1}
            suffix="%"
            onChange={(coverOverhang) => apply({ coverOverhang }, "cover overhang")}
          />
        ) : null}
        <MockupRange
          label="Hinge / fold"
          value={mockup.hingeDepth ?? 3.5}
          min={0}
          max={12}
          step={0.1}
          suffix="%"
          onChange={(hingeDepth) => apply({ hingeDepth }, "cover hinge")}
        />
        <label className={styles.field}>
          <span>Page color</span>
          <input
            className={styles.colorField}
            type="color"
            value={mockup.pageColor ?? "#f3eee2"}
            onChange={(event) => apply({ pageColor: event.currentTarget.value }, "page color")}
          />
        </label>
        <label className={styles.field}>
          <span>Spine / edge</span>
          <input
            className={styles.colorField}
            type="color"
            value={mockup.spineColor}
            onChange={(event) => apply({ spineColor: event.currentTarget.value }, "spine color")}
          />
        </label>
      </div>
      <div className={styles.optionSection}>
        <h3>Light & shadow</h3>
        <MockupRange
          label="Direction"
          value={mockup.lightAngle}
          min={-180}
          max={180}
          suffix="°"
          onChange={(lightAngle) => apply({ lightAngle }, "mockup light")}
        />
        <MockupRange
          label="Elevation"
          value={mockup.lightElevation ?? 48}
          min={5}
          max={90}
          suffix="°"
          onChange={(lightElevation) => apply({ lightElevation }, "mockup light")}
        />
        <MockupRange
          label="Intensity"
          value={Math.round(mockup.lightIntensity * 100)}
          min={0}
          max={80}
          suffix="%"
          onChange={(value) => apply({ lightIntensity: value / 100 }, "mockup light")}
        />
        <MockupRange
          label="Ambient"
          value={Math.round((mockup.ambientLight ?? 0.34) * 100)}
          min={0}
          max={90}
          suffix="%"
          onChange={(value) => apply({ ambientLight: value / 100 }, "mockup ambient")}
        />
        <MockupRange
          label="Shadow blur"
          value={mockup.shadowBlur}
          min={0}
          max={80}
          onChange={(shadowBlur) => apply({ shadowBlur }, "mockup shadow")}
        />
        <MockupRange
          label="Shadow"
          value={Math.round(mockup.shadowOpacity * 100)}
          min={0}
          max={75}
          suffix="%"
          onChange={(value) => apply({ shadowOpacity: value / 100 }, "mockup shadow")}
        />
        <MockupRange
          label="Shadow offset"
          value={mockup.shadowOffset}
          min={0}
          max={100}
          onChange={(shadowOffset) => apply({ shadowOffset }, "mockup shadow")}
        />
      </div>
    </>
  );
}

function MockupRange({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.rangeField}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>
        {value}
        {suffix}
      </output>
    </label>
  );
}
