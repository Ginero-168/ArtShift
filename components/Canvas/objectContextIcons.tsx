import { createElement, type ReactNode, type SVGProps } from "react";
import {
  IconAlignCenterH,
  IconBold,
  IconBook,
  IconCloud,
  IconCornerRadius,
  IconCrop,
  IconDetach,
  IconDistributeH,
  IconDownload,
  IconFillSolid,
  IconFitCanvas,
  IconFlipHorizontal,
  IconFlipVertical,
  IconFrame,
  IconGroup,
  IconHealing,
  IconImage,
  IconMultiple,
  IconPalette,
  IconParagraph,
  IconPathfinderDivide,
  IconPathfinderExclude,
  IconPathfinderIntersect,
  IconPathfinderMinusBack,
  IconPathfinderMinusFront,
  IconPathfinderUnite,
  IconPen,
  IconPencil,
  IconRotate,
  IconShape,
  IconSpacing,
  IconSparkles,
  IconSquare,
  IconStrokeMed,
  IconText,
  IconTextMeasure,
  IconVectorNodes,
} from "@/components/icons";
import { getObjectContextIconName, type ObjectContextIconName } from "./objectContextIconRegistry";

export { OBJECT_CONTEXT_ICON_KEYS } from "./objectContextIconRegistry";

type ObjectContextIconProps = Pick<
  SVGProps<SVGSVGElement>,
  "aria-hidden" | "className" | "focusable"
> & { size?: number };
type ObjectContextIcon = (props: ObjectContextIconProps) => ReactNode;

const ICON_BY_NAME: Readonly<Record<ObjectContextIconName, ObjectContextIcon>> = Object.freeze({
  "flip-horizontal": IconFlipHorizontal,
  "flip-vertical": IconFlipVertical,
  rotate: IconRotate,
  crop: IconCrop,
  intelligence: IconSparkles,
  "remove-bg": IconHealing,
  vectorize1: IconPen,
  vectorize2: IconVectorNodes,
  vectorize3: IconCloud,
  download: IconDownload,
  image: IconImage,
  vector: IconVectorNodes,
  book: IconBook,
  frame: IconFrame,
  text: IconText,
  shape: IconShape,
  multiple: IconMultiple,
  align: IconAlignCenterH,
  distribute: IconDistributeH,
  group: IconGroup,
  color: IconPalette,
  fill: IconFillSolid,
  stroke: IconStrokeMed,
  "fit-canvas": IconFitCanvas,
  "corner-radius": IconCornerRadius,
  "edit-nodes": IconVectorNodes,
  edit: IconPencil,
  detach: IconDetach,
  font: IconText,
  size: IconTextMeasure,
  weight: IconBold,
  paragraph: IconParagraph,
  spacing: IconSpacing,
  unite: IconPathfinderUnite,
  "minus-front": IconPathfinderMinusFront,
  intersect: IconPathfinderIntersect,
  exclude: IconPathfinderExclude,
  "minus-back": IconPathfinderMinusBack,
  divide: IconPathfinderDivide,
  object: IconSquare,
});

export function getObjectContextIcon(label: string, props: ObjectContextIconProps = {}): ReactNode {
  const Icon = ICON_BY_NAME[getObjectContextIconName(label)];
  return createElement(Icon, {
    size: props.size ?? 15,
    "aria-hidden": true,
    focusable: "false",
    ...props,
  });
}
