import React from "react";
import type { PlanProposal } from "@/lib/designAgent/contracts";
import type { SequentialExecutionPlan } from "@/lib/ai/orchestration/turnOrchestrator";
import type { CoPilotErrorCard } from "@/lib/ai/coPilot";
import { summarizePlanForReview } from "@/lib/designAgent/planReview";
import {
  BoltIcon,
  CheckIcon,
  CloseIcon,
  ImageIcon,
  ImageSparkleIcon,
  SpinnerIcon,
} from "@/components/AI/ChatIcons";
import PromptRefinementCard from "@/components/AI/PromptRefinementCard";
import type { PromptRefinementCardData } from "@/lib/ai/orchestration/promptRefinement";

export type StagedVariationCard = {
  id: string;
  fileId: string;
  url?: string;
  width: number;
  height: number;
  label?: string;
  status: "staged" | "accepted" | "rejected";
  targetSlideId?: string;
};

export { PromptRefinementCard };

/* -------------------------------------------------------------------------- */
/* 1. Content Policy / Diagnostic Error Card                                 */
/* -------------------------------------------------------------------------- */
export interface ContentPolicyErrorCardProps {
  messageId: string;
  errorCard: CoPilotErrorCard;
  onEditPrompt?: (promptToEdit: string) => void;
}

export function ContentPolicyErrorCard({
  messageId,
  errorCard,
  onEditPrompt,
}: ContentPolicyErrorCardProps) {
  return (
    <div
      data-testid={`error-card-${messageId}`}
      style={{
        background: "#18181b",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 12,
        padding: "16px 18px",
        marginTop: 6,
        marginBottom: 6,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
      }}
    >
      <div
        style={{
          color: "#f8fafc",
          fontSize: 13.5,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        {errorCard.title}
      </div>
      <div
        style={{
          color: "#cbd5e1",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        {errorCard.description}
      </div>
      {errorCard.promptToEdit && (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 11.5,
            color: "#94a3b8",
            fontFamily: "ui-monospace, monospace",
            maxHeight: 68,
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.4,
          }}
        >
          <span style={{ color: "#64748b", fontWeight: 600, marginRight: 6 }}>คำขอ:</span>
          {errorCard.promptToEdit}
        </div>
      )}
      {errorCard.actionText && (
        <button
          type="button"
          onClick={() => {
            if (errorCard.promptToEdit && onEditPrompt) {
              onEditPrompt(errorCard.promptToEdit);
            }
          }}
          style={{
            marginTop: 6,
            background: "#ffffff",
            color: "#18181b",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "background 0.15s ease",
            width: "100%",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ffffff";
          }}
        >
          {errorCard.actionText}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Approval Plan Proposal Card                                            */
/* -------------------------------------------------------------------------- */
export interface ApprovalPlanProposalCardProps {
  pendingPlan: PlanProposal;
  busy: boolean;
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
}

export function ApprovalPlanProposalCard({
  pendingPlan,
  busy,
  onApplyPlan,
  onDiscardPlan,
}: ApprovalPlanProposalCardProps) {
  const pendingReview = summarizePlanForReview(pendingPlan);

  return (
    <div
      role="region"
      aria-label="Pending AI plan review"
      style={{
        alignSelf: "stretch",
        padding: "10px 12px",
        borderRadius: 8,
        background: "#fffbeb",
        border: "1px solid #fde68a",
        color: "#92400e",
        fontSize: 11,
      }}
    >
      <strong style={{ display: "block", fontSize: 11.5, color: "#78350f" }}>
        Reviewable plan
      </strong>
      <span style={{ display: "block", marginTop: 3, lineHeight: 1.4, color: "#92400e" }}>
        {pendingReview.summary.slice(0, 240)} · {pendingReview.commandCount} รายการ
      </span>
      <div style={{ marginTop: 7, lineHeight: 1.45 }}>
        <div>
          <strong>กระทบ:</strong> {pendingReview.targets.join(", ")}
        </div>
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          {pendingReview.changes.map((change: string, index: number) => (
            <li key={`${change}-${index}`}>{change}</li>
          ))}
        </ul>
        <div style={{ marginTop: 4, fontWeight: 600, color: "#b45309" }}>
          ต้องกด Apply plan เพื่อยืนยันก่อนแก้ไข Artwork
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          onClick={onApplyPlan}
          disabled={busy}
          style={{
            border: 0,
            borderRadius: 6,
            padding: "5px 10px",
            background: busy ? "#94a3b8" : "#d97706",
            color: "#ffffff",
            cursor: busy ? "default" : "pointer",
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          Apply plan
        </button>
        <button
          type="button"
          onClick={onDiscardPlan}
          disabled={busy}
          style={{
            border: "1px solid #d97706",
            borderRadius: 6,
            padding: "5px 10px",
            background: "transparent",
            color: "#b45309",
            cursor: busy ? "default" : "pointer",
            fontSize: 10.5,
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Sequential Execution Plan Card                                         */
/* -------------------------------------------------------------------------- */
export interface SequentialPlanCardProps {
  plan: SequentialExecutionPlan;
  busy: boolean;
  isExecutingPlan: boolean;
  onExecutePlan: () => void;
  onDiscardPlan: () => void;
}

export function SequentialPlanCard({
  plan,
  busy,
  isExecutingPlan,
  onExecutePlan,
  onDiscardPlan,
}: SequentialPlanCardProps) {
  return (
    <div
      role="region"
      aria-label="Sequential Execution Plan"
      style={{
        alignSelf: "stretch",
        padding: "10px 12px",
        borderRadius: 8,
        background: "#faf5ff",
        border: "1px solid #e9d5ff",
        color: "#581c87",
        fontSize: 11,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BoltIcon style={{ color: "#7c3aed" }} />
          <strong style={{ fontSize: 11.5, color: "#581c87" }}>
            Multi-Specialist Plan ({plan.steps.length} steps)
          </strong>
        </div>
        <span
          style={{
            fontSize: 9.5,
            padding: "2px 7px",
            borderRadius: 10,
            background: "#f3e8ff",
            color: "#7c3aed",
            fontWeight: 700,
          }}
        >
          {plan.overallStatus}
        </span>
      </div>
      <span style={{ display: "block", marginTop: 4, color: "#6b21a8", lineHeight: 1.4 }}>
        {plan.summary}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {plan.steps.map((step: any, idx: number) => (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 8px",
              background: "#ffffff",
              borderRadius: 6,
              border: "1px solid #f3e8ff",
              fontSize: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, color: "#7c3aed" }}>#{idx + 1}</span>
              <strong style={{ color: "#1e1b4b" }}>{step.name}</strong>
              <span
                style={{
                  fontSize: 9,
                  background: "#f3e8ff",
                  color: "#6b21a8",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                {step.specialist}
              </span>
            </div>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color:
                  step.status === "completed"
                    ? "#059669"
                    : step.status === "running"
                      ? "#2563eb"
                      : step.status === "paused_on_gate"
                        ? "#d97706"
                        : step.status === "failed"
                          ? "#dc2626"
                          : "#64748b",
              }}
            >
              {step.status === "completed" ? (
                <>
                  <CheckIcon style={{ width: 11, height: 11, color: "#059669" }} />
                  <span>Done</span>
                </>
              ) : step.status === "running" ? (
                <>
                  <SpinnerIcon style={{ width: 11, height: 11, color: "#2563eb" }} />
                  <span>Running</span>
                </>
              ) : step.status === "paused_on_gate" ? (
                <span>Quality Gate</span>
              ) : step.status === "failed" ? (
                <>
                  <CloseIcon style={{ width: 11, height: 11, color: "#dc2626" }} />
                  <span>Failed</span>
                </>
              ) : (
                "Pending"
              )}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          type="button"
          onClick={onExecutePlan}
          disabled={busy || isExecutingPlan}
          style={{
            border: 0,
            borderRadius: 6,
            padding: "6px 12px",
            background: isExecutingPlan ? "#9333ea" : "#7c3aed",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 10.5,
            cursor: busy || isExecutingPlan ? "default" : "pointer",
          }}
        >
          {isExecutingPlan
            ? "กำลังรันแผน..."
            : plan.overallStatus === "paused"
              ? "Resume Execution"
              : "Approve & Execute Plan"}
        </button>
        <button
          type="button"
          onClick={onDiscardPlan}
          disabled={isExecutingPlan}
          style={{
            border: "1px solid #ddd6fe",
            borderRadius: 6,
            padding: "6px 10px",
            background: "transparent",
            color: "#7c3aed",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Staged Candidate Variations Tray                                       */
/* -------------------------------------------------------------------------- */
export interface StagedVariationsCardProps {
  stagedVariations: StagedVariationCard[];
  onVariationHover: (variation: StagedVariationCard) => void;
  onVariationLeave: () => void;
  onCommitVariation: (variation: StagedVariationCard) => void;
  onDismissVariation: (variationId: string) => void;
  onClearTray: () => void;
}

export function StagedVariationsCard({
  stagedVariations,
  onVariationHover,
  onVariationLeave,
  onCommitVariation,
  onDismissVariation,
  onClearTray,
}: StagedVariationsCardProps) {
  if (stagedVariations.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Candidate Variations Staging Tray"
      style={{
        alignSelf: "stretch",
        padding: "8px 10px",
        borderRadius: 8,
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        fontSize: 10.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ImageSparkleIcon style={{ color: "#16a34a", width: 14, height: 14 }} />
          <strong style={{ fontSize: 11, color: "#15803d" }}>
            Staging Tray ({stagedVariations.length} Candidate Variations)
          </strong>
        </div>
        <button
          type="button"
          onClick={onClearTray}
          style={{
            background: "none",
            border: "none",
            fontSize: 9.5,
            color: "#16a34a",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Clear Tray
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {stagedVariations.map((v) => (
          <div
            key={v.id}
            onMouseEnter={() => onVariationHover(v)}
            onMouseLeave={onVariationLeave}
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/x-artshift-chat-image",
                JSON.stringify({ fileId: v.fileId || "", url: v.url || "" }),
              );
              if (v.fileId) {
                e.dataTransfer.setData("artshift/file-id", v.fileId);
              }
              if (v.url) {
                e.dataTransfer.setData("text/uri-list", v.url);
                e.dataTransfer.setData("text/plain", v.url);
              }
              e.dataTransfer.effectAllowed = "copy";
            }}
            title="คลิกเพื่อพรีวิว หรือลากไปวางบน Canvas ได้"
            style={{
              position: "relative",
              flex: "0 0 110px",
              border: v.status === "accepted" ? "2px solid #10b981" : "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 5,
              background: "#ffffff",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              cursor: "grab",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 64,
                borderRadius: 4,
                overflow: "hidden",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {v.url ? (
                // biome-ignore lint/a11y/useAltText: Staged variation candidate preview
                // biome-ignore lint/performance/noImgElement: Direct candidate variation preview in staging tray
                <img
                  src={v.url}
                  alt={v.label || "Candidate preview"}
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <ImageIcon style={{ width: 22, height: 22, color: "#94a3b8" }} />
              )}
            </div>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: "#334155",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {v.label}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommitVariation(v);
                }}
                style={{
                  flex: 1,
                  padding: "3px 4px",
                  borderRadius: 4,
                  border: "none",
                  background: v.status === "accepted" ? "#10b981" : "#4f46e5",
                  color: "#ffffff",
                  fontSize: 9.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                {v.status === "accepted" ? (
                  <>
                    <CheckIcon style={{ width: 10, height: 10 }} />
                    <span>Done</span>
                  </>
                ) : (
                  "Place"
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissVariation(v.id);
                }}
                style={{
                  padding: "3px 5px",
                  borderRadius: 4,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#64748b",
                  fontSize: 9,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CloseIcon style={{ width: 10, height: 10 }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Combined Action Cards Container                                        */
/* -------------------------------------------------------------------------- */
export interface ChatActionCardsProps {
  promptRefinementData?: PromptRefinementCardData | null;
  onGenerateFromRefinement?: (prompt: string) => void;
  onApplyRefinementToComposer?: (prompt: string) => void;
  onDismissRefinement?: () => void;

  pendingPlan?: PlanProposal | null;
  busy?: boolean;
  onApplyPendingPlan?: () => void;
  onDiscardPendingPlan?: () => void;

  pendingSequentialPlan?: SequentialExecutionPlan | null;
  isExecutingPlan?: boolean;
  onExecuteSequentialPlan?: () => void;
  onDiscardSequentialPlan?: () => void;

  stagedVariations?: StagedVariationCard[];
  onVariationHover?: (variation: StagedVariationCard) => void;
  onVariationLeave?: () => void;
  onCommitVariation?: (variation: StagedVariationCard) => void;
  onDismissVariation?: (variationId: string) => void;
  onClearVariationsTray?: () => void;
}

export default function ChatActionCards({
  promptRefinementData,
  onGenerateFromRefinement,
  onApplyRefinementToComposer,
  onDismissRefinement,

  pendingPlan,
  busy = false,
  onApplyPendingPlan,
  onDiscardPendingPlan,

  pendingSequentialPlan,
  isExecutingPlan = false,
  onExecuteSequentialPlan,
  onDiscardSequentialPlan,

  stagedVariations = [],
  onVariationHover,
  onVariationLeave,
  onCommitVariation,
  onDismissVariation,
  onClearVariationsTray,
}: ChatActionCardsProps) {
  return (
    <>
      {promptRefinementData && onGenerateFromRefinement && onApplyRefinementToComposer && onDismissRefinement && (
        <PromptRefinementCard
          data={promptRefinementData}
          onGenerate={onGenerateFromRefinement}
          onApplyToComposer={onApplyRefinementToComposer}
          onDismiss={onDismissRefinement}
        />
      )}

      {pendingPlan && onApplyPendingPlan && onDiscardPendingPlan && (
        <ApprovalPlanProposalCard
          pendingPlan={pendingPlan}
          busy={busy}
          onApplyPlan={onApplyPendingPlan}
          onDiscardPlan={onDiscardPendingPlan}
        />
      )}

      {pendingSequentialPlan && onExecuteSequentialPlan && onDiscardSequentialPlan && (
        <SequentialPlanCard
          plan={pendingSequentialPlan}
          busy={busy}
          isExecutingPlan={isExecutingPlan}
          onExecutePlan={onExecuteSequentialPlan}
          onDiscardPlan={onDiscardSequentialPlan}
        />
      )}

      {stagedVariations.length > 0 &&
        onVariationHover &&
        onVariationLeave &&
        onCommitVariation &&
        onDismissVariation &&
        onClearVariationsTray && (
          <StagedVariationsCard
            stagedVariations={stagedVariations}
            onVariationHover={onVariationHover}
            onVariationLeave={onVariationLeave}
            onCommitVariation={onCommitVariation}
            onDismissVariation={onDismissVariation}
            onClearTray={onClearVariationsTray}
          />
        )}
    </>
  );
}
