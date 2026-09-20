"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@/components/icons";
import {
  applyTextEffectPresetOperation,
  searchTextEffectPresets,
  TEXT_EFFECT_FAMILY_LABELS,
  TEXT_EFFECT_FAMILY_ORDER,
  type TextEffectFamily,
  type TextEffectPreset,
  textEffectPreviewStyle,
} from "@/lib/appearance";
import type { AppearanceOperation } from "@/lib/appearance/types";
import type { EngineElement } from "@/lib/engine/types";
import styles from "./Builder.module.css";

export default function TextEffectPresetPicker({
  onApply,
}: {
  onApply: (
    operation: AppearanceOperation | ((target: EngineElement) => AppearanceOperation | null),
    label: string,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const matches = searchTextEffectPresets(query);
    const byFamily = {} as Record<TextEffectFamily, TextEffectPreset[]>;
    for (const family of TEXT_EFFECT_FAMILY_ORDER) byFamily[family] = [];
    for (const preset of matches) {
      byFamily[preset.family] ??= [];
      byFamily[preset.family].push(preset);
    }
    return TEXT_EFFECT_FAMILY_ORDER.map((family) => ({
      family,
      label: TEXT_EFFECT_FAMILY_LABELS[family],
      presets: byFamily[family] ?? [],
    })).filter((group) => group.presets.length > 0);
  }, [query]);

  return (
    <div className={styles.textFxPicker} data-text-effect-presets="true">
      <div className={styles.textFxPickerHeader}>
        <span>Text Effect</span>
        <span className={styles.textFxPickerHint}>Static stills</span>
      </div>
      <label className={styles.textFxSearch}>
        <IconSearch size={12} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search presets"
          aria-label="Search text effect presets"
          autoComplete="off"
        />
      </label>
      <div className={styles.textFxList} role="listbox" aria-label="Text effect presets">
        {grouped.length === 0 ? (
          <p className={styles.fieldNote}>No presets match “{query.trim()}”.</p>
        ) : (
          grouped.map((group) => (
            <section key={group.family} className={styles.textFxFamily}>
              <h4>{group.label}</h4>
              <div className={styles.textFxGrid}>
                {group.presets.map((preset) => (
                  <PresetThumb
                    key={preset.id}
                    preset={preset}
                    onApply={() =>
                      onApply(
                        (target) => applyTextEffectPresetOperation(target, preset.id),
                        `text effect ${preset.name}`,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function PresetThumb({ preset, onApply }: { preset: TextEffectPreset; onApply: () => void }) {
  const preview = textEffectPreviewStyle(preset);
  return (
    <button
      type="button"
      className={styles.textFxThumb}
      role="option"
      aria-label={`${String(preset.id).padStart(2, "0")} ${preset.name}`}
      title={preset.description}
      onClick={onApply}
    >
      <span className={styles.textFxSwatch} aria-hidden="true">
        {preview.layers.map((layer, index) => (
          <span
            key={`${layer.color}-${index}`}
            className={styles.textFxLayer}
            style={{
              color: layer.color,
              opacity: layer.opacity,
              transform: `translate(${layer.offsetX / 3}px, ${layer.offsetY / 3}px)`,
            }}
          >
            Aa
          </span>
        ))}
        <span className={styles.textFxSample} style={preview.sample}>
          Aa
        </span>
      </span>
      <span className={styles.textFxName}>
        <span className={styles.textFxIndex}>{String(preset.id).padStart(2, "0")}</span>
        {preset.name}
      </span>
    </button>
  );
}
