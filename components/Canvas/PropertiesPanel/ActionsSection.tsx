"use client";

import {
  IconBringForward,
  IconBringToFront,
  IconDuplicate,
  IconGroup,
  IconLink,
  IconSendBackward,
  IconSendToBack,
  IconTrash,
} from "@/components/icons";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement } from "@/lib/engine/types";
import { AlignBtn, alignElements, distributeElements, IconBtn, Section } from "./PanelParts";

export function ActionsSection({ selected }: { selected: EngineElement[] }) {
  const ids = selected.map((el) => el.id);
  const bringToFront = useEngine((s) => s.bringToFront);
  const sendToBack = useEngine((s) => s.sendToBack);
  const bringForward = useEngine((s) => s.bringForward);
  const sendBackward = useEngine((s) => s.sendBackward);
  const deleteElements = useEngine((s) => s.deleteElements);
  const copyElements = useEngine((s) => s.copyElements);
  const pasteElements = useEngine((s) => s.pasteElements);
  const groupElements = useEngine((s) => s.groupElements);
  const ungroupElements = useEngine((s) => s.ungroupElements);

  return (
    <>
      {/* Align & Distribute */}
      {selected.length >= 2 && (
        <Section>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 2 }}>
              <AlignBtn
                label="L"
                title="Align left"
                onClick={() => alignElements(selected, "left")}
              />
              <AlignBtn
                label="C"
                title="Align center"
                onClick={() => alignElements(selected, "centerH")}
              />
              <AlignBtn
                label="R"
                title="Align right"
                onClick={() => alignElements(selected, "right")}
              />
              <AlignBtn
                label="T"
                title="Align top"
                onClick={() => alignElements(selected, "top")}
              />
              <AlignBtn
                label="M"
                title="Align middle"
                onClick={() => alignElements(selected, "middleV")}
              />
              <AlignBtn
                label="B"
                title="Align bottom"
                onClick={() => alignElements(selected, "bottom")}
              />
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              <AlignBtn
                label="DH"
                title="Distribute horizontal"
                onClick={() => distributeElements(selected, "h")}
              />
              <AlignBtn
                label="DV"
                title="Distribute vertical"
                onClick={() => distributeElements(selected, "v")}
              />
            </div>
          </div>
        </Section>
      )}

      {/* Layers */}
      <Section>
        <div style={{ display: "flex", gap: 3 }}>
          <IconBtn onClick={() => sendToBack(ids)} title="Send to back">
            <IconSendToBack size={14} />
          </IconBtn>
          <IconBtn onClick={() => sendBackward(ids)} title="Send backward">
            <IconSendBackward size={14} />
          </IconBtn>
          <IconBtn onClick={() => bringForward(ids)} title="Bring forward">
            <IconBringForward size={14} />
          </IconBtn>
          <IconBtn onClick={() => bringToFront(ids)} title="Bring to front">
            <IconBringToFront size={14} />
          </IconBtn>
        </div>
      </Section>

      {/* Actions */}
      <Section>
        <div style={{ display: "flex", gap: 3 }}>
          <IconBtn
            onClick={() => {
              copyElements(ids);
              pasteElements();
            }}
            title="Duplicate"
          >
            <IconDuplicate size={14} />
          </IconBtn>
          <IconBtn onClick={() => deleteElements(ids)} title="Delete" danger>
            <IconTrash size={14} />
          </IconBtn>
          {selected.length > 1 && (
            <IconBtn onClick={() => groupElements(ids)} title="Group">
              <IconGroup size={14} />
            </IconBtn>
          )}
          {selected.some((el) => el.groupIds.length > 0) && (
            <IconBtn onClick={() => ungroupElements(ids)} title="Ungroup">
              <IconLink size={14} />
            </IconBtn>
          )}
        </div>
      </Section>
    </>
  );
}
