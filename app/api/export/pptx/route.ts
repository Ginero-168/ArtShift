import { type NextRequest, NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { getPptxSlideTransform } from "@/lib/engine/exportPPTX";
import { getRenderableElements } from "@/lib/engine/layers";
import { PPTX_EXPORT_LIMITS, parsePptxExportPayload } from "@/lib/engine/pptxPayload";
import type { ImageElement, TextElement } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PX_TO_IN = 1 / 96;

export async function POST(req: NextRequest) {
  try {
    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > PPTX_EXPORT_LIMITS.bodyBytes) {
      return NextResponse.json({ error: "PPTX export payload is too large" }, { status: 413 });
    }

    const raw = await req.arrayBuffer();
    if (raw.byteLength > PPTX_EXPORT_LIMITS.bodyBytes) {
      return NextResponse.json({ error: "PPTX export payload is too large" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const payload = parsePptxExportPayload(body);
    if (!payload) {
      return NextResponse.json({ error: "Invalid document structure" }, { status: 400 });
    }
    const { doc, rasterizedImages } = payload;

    const pptx = new PptxGenJS();
    const targetSize = {
      width: doc.slides[0]?.width ?? doc.width,
      height: doc.slides[0]?.height ?? doc.height,
    };

    const wIn = targetSize.width * PX_TO_IN;
    const hIn = targetSize.height * PX_TO_IN;
    pptx.defineLayout({ name: "ARTSHIFT", width: wIn, height: hIn });
    pptx.layout = "ARTSHIFT";

    const px = (n: number) => n * PX_TO_IN;

    for (const slide of doc.slides) {
      const s = pptx.addSlide();
      s.background = { color: (slide.background || "#ffffff").replace("#", "") };
      const transform = getPptxSlideTransform(slide, targetSize);
      const tx = (value: number) => transform.offsetX + value * transform.scale;
      const ty = (value: number) => transform.offsetY + value * transform.scale;
      const scaled = (value: number) => value * transform.scale;

      const ordered = getRenderableElements(slide);

      for (const el of ordered) {
        if (el.type === "frame") continue;

        const common = {
          x: px(tx(el.x)),
          y: px(ty(el.y)),
          w: px(scaled(el.width)),
          h: px(scaled(el.height)),
          rotate: (el.angle * 180) / Math.PI,
        };

        // Text elements
        if (el.type === "text") {
          const te = el as TextElement;
          s.addText(te.text, {
            ...common,
            fontSize: Math.max(8, Math.round(te.fontSize * transform.scale * 0.75)),
            fontFace: te.fontFamily.split(",")[0].replace(/['"]/g, "").trim() || "Noto Sans Thai",
            color: te.strokeColor.replace("#", ""),
            bold: te.fontStyle.includes("bold"),
            italic: te.fontStyle.includes("italic"),
            align: te.textAlign,
            valign:
              te.verticalAlign === "middle"
                ? "middle"
                : te.verticalAlign === "bottom"
                  ? "bottom"
                  : "top",
          });
          continue;
        }

        // Image elements
        if (el.type === "image") {
          const ie = el as ImageElement;
          const dataUrl = rasterizedImages?.[ie.fileId] ?? rasterizedImages?.[el.id];
          if (dataUrl?.startsWith("data:")) {
            s.addImage({ ...common, data: dataUrl });
          } else {
            s.addText(`[image]`, { ...common, color: "888888", fontSize: 10 });
          }
          continue;
        }

        // Simple shapes (roughness == 0) — map to native PPTX shapes
        if (
          (el.type === "rect" || el.type === "ellipse" || el.type === "diamond") &&
          el.roughness === 0
        ) {
          const ST = pptx.ShapeType as Record<string, unknown>;
          const shapeMap: Record<string, unknown> = {
            rect: ST.roundRect ?? ST.rect,
            ellipse: ST.ellipse,
            diamond: ST.diamond,
          };
          const kind = shapeMap[el.type] as Parameters<typeof s.addShape>[0];
          if (kind) {
            s.addShape(kind, {
              ...common,
              fill: {
                color: (el.backgroundColor || "ffffff")
                  .replace("#", "")
                  .replace("transparent", "ffffff"),
              },
              line:
                el.strokeWidth > 0
                  ? {
                      color: el.strokeColor.replace("#", ""),
                      width: el.strokeWidth * transform.scale,
                    }
                  : { type: "none" as const },
            });
            continue;
          }
        }

        // Rasterized elements (rough shapes, freedraw, vector paths, etc.)
        const rasterData = rasterizedImages?.[el.id];
        if (rasterData?.startsWith("data:")) {
          const pad = 4;
          s.addImage({
            data: rasterData,
            x: px(tx(el.x - pad)),
            y: px(ty(el.y - pad)),
            w: px(scaled(el.width + pad * 2)),
            h: px(scaled(el.height + pad * 2)),
          });
        }
      }
    }

    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const filename = `${slugify(doc.title || "slides")}.pptx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PPTX export server error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PPTX export failed" },
      { status: 500 },
    );
  }
}

function slugify(s: string) {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/gi, "-")
      .replace(/^-|-$/g, "") || "slides"
  );
}
