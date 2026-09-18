"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  type ChatMdInline,
  looksLikeChatMarkdown,
  parseChatMarkdown,
} from "@/lib/ai/chatMarkdownLite";

type Props = {
  content: string;
  style?: CSSProperties;
  /** When false, always render as plain pre-wrap text. */
  enableMarkdown?: boolean;
};

function renderInlines(inlines: ChatMdInline[], keyPrefix: string): ReactNode[] {
  return inlines.map((part, idx) => {
    if (part.type === "bold") {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} style={{ fontWeight: 700 }}>
          {part.text}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t-${idx}`}>{part.text}</span>;
  });
}

export default function ChatMarkdown({ content, style, enableMarkdown = true }: Props) {
  if (!enableMarkdown || !looksLikeChatMarkdown(content)) {
    return <span style={{ whiteSpace: "pre-wrap", ...style }}>{content}</span>;
  }

  const blocks = parseChatMarkdown(content);

  return (
    <div
      data-testid="chat-markdown"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        whiteSpace: "normal",
        ...style,
      }}
    >
      {blocks.map((block, idx) => {
        if (block.type === "spacer") {
          return <div key={`sp-${idx}`} style={{ height: 4 }} />;
        }
        if (block.type === "heading") {
          const size = block.level === 1 ? 14 : block.level === 2 ? 13 : 12.5;
          return (
            <div
              key={`h-${idx}`}
              style={{
                fontSize: size,
                fontWeight: 750,
                color: "inherit",
                marginTop: idx === 0 ? 0 : 4,
                lineHeight: 1.35,
              }}
            >
              {renderInlines(block.inlines, `h${idx}`)}
            </div>
          );
        }
        if (block.type === "list") {
          return (
            <ul
              key={`ul-${idx}`}
              style={{
                margin: 0,
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {block.items.map((item, j) => (
                <li key={`li-${idx}-${j}`} style={{ lineHeight: 1.45 }}>
                  {renderInlines(item, `li${idx}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`p-${idx}`} style={{ margin: 0, lineHeight: 1.5 }}>
            {renderInlines(block.inlines, `p${idx}`)}
          </p>
        );
      })}
    </div>
  );
}
