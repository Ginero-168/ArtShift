# Vision Model Alternatives for ArtShift

> Research date: 23 August 2026
>
> Question: alternatives to Florence-2 for discovering and localizing objects in raster collages.
>
> Source policy: primary sources only. Browser compatibility statements are based on the installed `@huggingface/transformers` runtime and first-party model cards; quality rankings are engineering recommendations, not claims that have already been benchmarked on ArtShift fixtures.

## Short answer

Florence-2 is a useful general vision model, but it is not the best shape for ArtShift's main extraction problem. It generates boxes and labels as text for several tasks. That makes it flexible, but also means that dense collages, repeated products, thin accessories, and touching objects can be missed or grouped into coarse regions.

The best direct replacement to test first is **Grounding DINO Tiny**. It is a dedicated open-set detector, already wired into ArtShift, and has a Transformers.js-compatible ONNX model. The best higher-ceiling option for an API/Desktop processor is **YOLOE** or **SAM 3**, but neither should be made the browser default before a separate runtime and license review.

## Candidate comparison

| Candidate | What it does | Browser fit in ArtShift | Fit for Extract All | Recommendation |
|---|---|---:|---:|---|
| **Grounding DINO Tiny** | Text-conditioned open-set object detection; returns boxes and labels for text queries | **High** — existing `onnx-community/grounding-dino-tiny-ONNX` path is already present | Good for recall and labels; not a final mask generator | **Test first** |
| **OWLv2** | Zero-shot text-conditioned object detection with an objectness score independent of text queries | **High** — Transformers.js has OWLv2 support and ONNX checkpoints exist | Useful as a second detector or reranker; still needs a label vocabulary | Test as A/B |
| **OmDet-Turbo Tiny** | Fast open-vocabulary detector with decoupled text embeddings that can be cached | Medium/low for current browser — official implementation is PyTorch and ONNX conversion is documented, but no current ArtShift browser adapter | Good API/Desktop candidate when repeated label queries matter | Benchmark later |
| **YOLO-World** | Real-time open-vocabulary detection and grounding | Low for current browser — official route is Python/ONNX deployment rather than the current Transformers.js path | Good fast API/Desktop detector; license needs careful handling | Optional non-commercial experiment |
| **YOLOE** | Text-, visual-, and prompt-free open-vocabulary detection and segmentation | Low for current browser; strongest as a Python/GPU worker | Very promising because prompt-free mode can discover objects without Florence-generated labels, and it can return masks | Highest-ceiling detector/segmenter to evaluate outside Browser |
| **SAM 2** | Promptable segmentation from points, boxes, or masks | Already integrated | Excellent refinement after a proposal; not a detector by itself | Keep as refinement stage |
| **SAM 3** | Promptable concept segmentation from text and image exemplars; returns matching instance masks | Not a safe current browser default; heavy runtime and separate license review | Closest to the desired “find all matching instances and cut them out” behavior | API/Desktop premium spike |
| **GLIP** | Open-vocabulary grounding/detection | Poor fit for a new browser path; older and heavier integration | Historical fallback only | Do not prioritize |

Sources: [Florence-2 model card](https://huggingface.co/microsoft/Florence-2-base), [Grounding DINO official repository](https://github.com/IDEA-Research/GroundingDINO), [Grounding DINO Transformers.js model card](https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX), [OWLv2 documentation](https://huggingface.co/docs/transformers/model_doc/owlv2), [OWLv2 Transformers.js model card](https://huggingface.co/onnx-community/owlv2-base-patch16-ensemble-ONNX), [OmDet-Turbo official repository](https://github.com/om-ai-lab/OmDet), [YOLO-World official repository](https://github.com/AILab-CVC/YOLO-World), [YOLOE documentation](https://docs.ultralytics.com/models/yoloe), [Meta SAM 2](https://ai.meta.com/research/sam2/), and [Meta SAM 3](https://ai.meta.com/sam3/).

## Why Grounding DINO is the first replacement

Grounding DINO is a detector rather than a general captioning/generation model. Its interface is explicit: provide a text query such as `bag. shirt. cup. keychain.` and receive candidate boxes, scores, and phrases. The official Transformers.js-compatible model documents the same pipeline already used by ArtShift.

ArtShift already has this path in [lib/vision/advancedVision.ts](/Users/peerawatrodkaew/Desktop/Scripting/ArtShift/lib/vision/advancedVision.ts). That substantially lowers integration risk compared with replacing the Florence runtime. The limitation is important: Grounding DINO still needs candidate phrases. It is not an automatic “discover every unknown object” model when called with an empty query. Therefore it should be used as a proposal/label pass, while alpha components and watershed remain responsible for completeness.

## Why OWLv2 is a useful second test

OWLv2 is also zero-shot and text-conditioned, but its objectness classifier estimates whether a predicted region contains an object independently of text queries. That is attractive for collages where Florence labels are unreliable. However, it still needs candidate text prompts for semantic grouping, and a larger checkpoint may add memory and latency. It is a good A/B candidate, not an automatic solution to the missing-object problem.

## Why YOLOE and SAM 3 are more interesting than another Florence tuning pass

The current failure is primarily instance discovery, not caption quality. YOLOE supports text prompts, visual prompts, and a prompt-free mode; its documentation also describes built-in instance segmentation. SAM 3 is designed for promptable concept segmentation and can return masks for all matching instances from text or image exemplars. Those capabilities are closer to “extract every separate object” than Florence-2's generated box list.

The tradeoff is deployment. Ultralytics states that its YOLO products are AGPL-3.0 by default and require an Enterprise license for proprietary/commercial use. SAM 3 has a separate SAM license, so it must be reviewed independently before commercial distribution. For the current non-commercial phase, both are candidates for an isolated API/Desktop experiment, not a reason to destabilize the Local Browser path.

## Recommended ArtShift architecture

Do not replace the `ObjectExtractionProcessor` contract when changing detectors. Add providers behind it:

```ts
interface ObjectProposalProvider {
  propose(input: ExtractionInput, options: ProposalOptions): Promise<ObjectProposal[]>;
  capabilities(): ProposalCapabilities;
}
```

Recommended providers:

1. `AlphaComponentProvider` — always-on geometry baseline; finds disconnected foreground regions.
2. `GroundingDinoProvider` — first browser detector; labels and recalls semantic regions.
3. `Owlv2Provider` — optional browser A/B detector/reranker.
4. `YoloEProvider` — API/Desktop prompt-free detector-segmenter.
5. `Sam2Provider` — refinement for accepted boxes, points, and watershed proposals.
6. `Sam3Provider` — API/Desktop concept segmentation for the premium path.

The final extraction must be mask-first:

```text
foreground alpha
  -> alpha components + suspicious-component watershed
  -> Grounding DINO / OWLv2 / YOLOE proposals
  -> SAM 2 or SAM 3 mask refinement
  -> mask fusion + duplicate suppression
  -> user Split/Merge/Accept
  -> transparent assets
```

No detector should be allowed to replace a known-good alpha mask with an empty rectangle. Boxes remain proposals; masks remain the source of truth.

## A/B test plan before changing the default

Use the same fixed fixture set that includes repeated objects, small objects, touching objects, thin straws/handles, transparent gaps, shadows, and white-background products. Record:

- recall: accepted objects / expected objects;
- duplicate rate;
- merged-object rate;
- missing-thin-part rate;
- empty-output rate;
- mask leakage and boundary quality;
- first-load time, warm inference time, peak memory, and UI blocking time.

Run these variants:

1. Current Florence-2 `OD` and dense-region pass.
2. Grounding DINO Tiny with a fixed candidate vocabulary.
3. OWLv2 with the same vocabulary and objectness filtering.
4. Alpha + watershed without a vision-language detector.
5. Alpha + Grounding DINO labels + SAM 2 refinement.

Only promote a detector when it improves object recall and mask quality without causing a regression in the Local path. The likely winning design is not one model replacing Florence; it is **alpha geometry for completeness, a dedicated detector for semantic recall, and a promptable segmenter for final masks**.

## Decision

For ArtShift now:

- Keep Florence-2 only for optional captions/OCR or label fallback.
- Make Grounding DINO Tiny the first detector A/B candidate because it is already available locally and browser-compatible.
- Add OWLv2 as the second browser A/B candidate.
- Do not put YOLOE, YOLO-World, OmDet-Turbo, or SAM 3 into the main browser bundle yet; evaluate them in the API/Desktop processor.
- Keep Extract Fast's alpha geometry as the completeness baseline.
- Treat SAM 2/SAM 3 as mask refinement, not a replacement for foreground discovery unless the model is explicitly run in concept/prompt-free mode.
