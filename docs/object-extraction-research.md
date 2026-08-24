# Object Extraction Research for ArtShift

> Research date: 23 August 2026
>
> Scope: extracting every usable object from one raster collage into separate transparent assets, without assuming that one detector or one budget tier can solve the whole problem.
>
> Source policy: primary sources only — official papers, official repositories, and first-party documentation. Recommendations marked as such are engineering inferences from the documented capabilities and ArtShift's observed failures.

## Executive conclusion

ArtShift should stop treating object extraction as a single `detector -> box -> crop` operation. The hard part in the current examples is not only background removal. It is instance discovery: deciding that two bags, two shirts, three keychains, or a cup and its straw are separate usable assets.

The strongest unconstrained design is a **mask-first multi-proposal pipeline**:

1. Produce one or more high-quality foreground mattes.
2. Generate instance proposals from several independent signals: alpha components, an automatic mask generator, text/open-vocabulary detection, and optionally a visual exemplar.
3. Refine each proposal at high resolution with a promptable segmentation model.
4. Split touching or repeated objects with distance-transform/watershed and contour analysis.
5. Fuse masks, not just boxes, using confidence, coverage, boundary agreement, and duplicate suppression.
6. Export each accepted mask as a transparent asset and keep the source raster immutable.

The current local Fast path is valuable because it already follows part of this design: Remove BG provides the foreground alpha and connected components provide geometry. It should remain the fast baseline, but the next quality step should be a **proposal ensemble plus mask fusion**, not another Florence-2 tuning pass.

## What each technology can and cannot solve

| Family | Strong at | Weak at | Role in ArtShift |
|---|---|---|---|
| RMBG / BiRefNet / dichotomous segmentation | Foreground-versus-background matte, soft edges, fine silhouettes | Does not inherently know that two nearby foreground objects are separate instances | Foreground alpha candidates |
| Connected components / contours | Very fast disconnected-object discovery | Touching objects become one component; holes and shadows can mislead | Fast geometry baseline |
| Distance transform + watershed | Splitting touching blobs when there are multiple peaks | Needs good markers; can over-split one irregular object | Second-stage split for bags, shirts, keychains, and touching products |
| GrabCut / graph-cut refinement | Local refinement from a rectangle or mask and image colors | Needs a useful seed; not an automatic object inventory | Local fallback/refinement, especially for ambiguous crops |
| Grounding DINO / OWLv2 / Florence-2 | Open-vocabulary labels and coarse location proposals | Boxes are not final cutout geometry; repeated objects may be grouped or missed | Labels, proposals, and recall only |
| SAM 2 / SAM-HQ | Prompted object masks from points, boxes, or masks; fine boundaries | Quality depends on prompt; a bad coarse box produces a bad instance; one call per object is expensive | High-quality refinement of accepted proposals |
| SAM 3 | Text/exemplar concept detection plus segmentation of matching instances | Heavy server/GPU-oriented stack and separate license/runtime considerations | Premium server or desktop quality tier to evaluate, not browser default |
| Mask2Former / OneFormer | Full instance/panoptic segmentation with class masks | Usually needs a suitable trained checkpoint/domain; heavier integration | High-end server benchmark or domain-specific model |
| Photopea / Pintura / desktop editor bridge | Mature manual correction tools and user intent | Creates a second editor/document model; not a native ArtShift pipeline | Escape hatch for difficult cases, import/export boundary |

Sources: [SAM 2](https://ai.meta.com/research/publications/sam-2-segment-anything-in-images-and-videos/), [SAM 2 repository](https://github.com/facebookresearch/segment-anything-2), [HQ-SAM](https://github.com/SysCV/sam-hq), [SAM 3](https://ai.meta.com/sam3/), [Grounding DINO paper](https://arxiv.org/abs/2303.05499), [Mask2Former paper](https://openaccess.thecvf.com/content/CVPR2022/papers/Cheng_Masked-Attention_Mask_Transformer_for_Universal_Image_Segmentation_CVPR_2022_paper.pdf), and [OpenCV segmentation documentation](https://docs.opencv.org/4.12.0/d7/d1c/tutorial_js_watershed.html).

## Candidate approaches without model or budget constraints

### Option A — High-end local/server ensemble

Use the current local Fast alpha as an initial proposal source, then add:

- a high-resolution foreground model such as [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) or a newer RMBG service/model for an independent alpha;
- [SAM 3](https://ai.meta.com/research/publications/sam-3-segment-anything-with-concepts/) with noun phrases and exemplar prompts to find repeated instances;
- [SAM-HQ](https://github.com/SysCV/sam-hq) or SAM 2 for high-quality mask refinement;
- Grounding DINO or Florence-2 only for semantic labels and proposal recall;
- OpenCV distance transform and watershed to split connected masks before refinement.

This is the highest-ceiling zero-shot route. It is also the most complex. It requires model orchestration, GPU memory management, confidence calibration, and a clear rule for rejecting contradictory masks. It should run in an API worker or a desktop process, not in the main Next.js browser bundle.

### Option B — Classical CV plus one strong segmenter

This is the best balance for the current collage type:

1. Remove background once.
2. Extract connected components at multiple alpha thresholds.
3. For large components, compute a distance transform and use local maxima as watershed markers.
4. For each candidate region, generate a center point, interior points, boundary negatives, and a padded box.
5. Run SAM-HQ/SAM 2 once per candidate with those prompts.
6. Keep the refined mask only when it agrees with the foreground alpha and does not steal pixels from a neighboring accepted mask.

OpenCV officially documents distance transform, connected components, and marker-based watershed for separating mutually touching objects. It also documents GrabCut as an iterative rectangle/mask-based refinement algorithm. These primitives are deterministic and cheap enough to run in a Worker.

This route directly targets the observed failure: Fast already finds many disconnected regions, while watershed and prompt refinement handle the cases where a single alpha island contains multiple touching objects.

### Option C — Train a domain-specific instance segmentation model

If ArtShift's real input is mostly product boards, merchandise sheets, posters, or design collages, a small labeled dataset may outperform a larger general-purpose model. Label 300–2,000 representative images with per-object masks, then fine-tune an instance/panoptic model such as Mask2Former or a modern detector-segmenter.

Advantages:

- repeated object types can be separated consistently;
- labels and masks are produced together;
- inference can be batched and benchmarked;
- the model learns ArtShift's actual image style instead of generic web imagery.

Costs and risks:

- dataset quality becomes the limiting factor;
- new input domains may regress;
- training, versioning, and evaluation become product infrastructure;
- a domain model still benefits from classical post-processing for thin accessories and transparent edges.

This is the most reliable long-term option if ArtShift can collect user-approved correction masks as training data.

### Option D — Human-in-the-loop “semi-automatic” extraction

The best result is not always a fully automatic result. A professional workflow can be:

1. Fast automatically proposes all regions.
2. The UI shows masks, not only rectangles.
3. The user clicks missing objects or adds positive/negative strokes.
4. SAM-HQ/SAM 3 refines the selected instance.
5. The user accepts, merges, splits, or rejects each asset.

SAM 2 and SAM 3 are explicitly promptable with points, boxes, masks, and — for SAM 3 — text or exemplar prompts. This approach converts model uncertainty into a quick correction loop and avoids silently exporting wrong blank boxes.

### Option E — External editor bridge

For users who need Photoshop-level manual control immediately, an optional bridge can send a selected raster crop to Photopea or Pintura, then import the resulting PNG/PSD as a new ArtShift revision. Photopea officially exposes Spot Healing Brush, Healing Brush, Patch, and Clone tool IDs; Pintura documents a retouch plugin that connects to external AI services.

This should be an escape hatch, not the core object model. Synchronizing two complete layer/history systems would add more risk than it removes.

## Recommended architecture for ArtShift

### One provider-neutral contract

Keep the orchestration independent from any individual model:

```ts
interface ObjectExtractionProcessor {
  propose(input: ExtractionInput, options: ExtractionOptions): Promise<ExtractionProposal[]>;
  refine(proposal: ExtractionProposal, options: RefinementOptions): Promise<InstanceMask>;
  fuse(masks: readonly InstanceMask[], options: FusionOptions): Promise<InstanceMask[]>;
  capabilities(): ExtractionCapabilities;
}
```

Implementations can then be:

- `FastLocalExtractor`: Remove BG + alpha components + direct crop;
- `HybridLocalExtractor`: Fast proposals + watershed + SAM-HQ/SAM 2 refinement;
- `PremiumServerExtractor`: SAM 3 / Mask2Former / BiRefNet ensemble on a GPU worker;
- `InteractiveExtractor`: user points/strokes plus SAM refinement;
- `ExternalEditorExtractor`: Photopea/Pintura import/export boundary.

The UI should receive `proposal`, `mask`, `confidence`, `source`, `label`, `warnings`, and `provenance`. It should not need to know whether the mask came from Florence, SAM, OpenCV, or a paid API.

### Mask-first data model

Do not make a bounding box the source of truth. Store:

- normalized mask or mask asset;
- tight alpha bounds derived from the mask;
- proposal and refinement provenance;
- confidence and conflict flags;
- source image revision and coordinate transform;
- optional semantic label;
- parent/child relationship when a region was split.

The box is a view derived from the mask. This prevents the “empty rectangle” failure mode and lets users split or merge without re-running background removal.

### Fusion rules

For every candidate mask, calculate:

- foreground coverage: how much accepted foreground alpha it contains;
- leakage: how much background or another accepted instance it contains;
- boundary agreement: difference between the candidate boundary and source alpha;
- duplicate overlap: IoU with accepted masks;
- thin-component preservation: whether small connected parts such as straws survive;
- confidence and provenance: model score, prompt type, and refinement path.

Accept a mask only when it passes minimum coverage and leakage rules. If two masks overlap, prefer the one with stronger boundary agreement, then subtract only the contested pixels from the lower-confidence mask. Never replace a known-good alpha pixel with a lower-confidence model's zero mask.

## What I recommend doing next

### Phase 1 — Improve the current local result

1. Keep Extract Fast as the baseline and add a hidden benchmark mode that records object count, alpha coverage, duplicate rate, empty-output rate, and elapsed time.
2. Add multi-threshold alpha proposals rather than one threshold. Union high-confidence interior components with lower-threshold edge components.
3. Add watershed only inside suspicious components: large area, elongated shape, multiple distance-transform peaks, or visible concavities.
4. Add mask previews and per-object accept/reject/split/merge controls.

### Phase 2 — Add premium refinement

1. Use SAM-HQ/SAM 2 for candidate masks generated by Fast + watershed.
2. Benchmark SAM 3 as a separate server/desktop processor, especially for repeated objects and text/exemplar prompts.
3. Keep Florence-2/Grounding DINO for labels and recall, never as final cutout geometry.

### Phase 3 — Learn from corrections

1. Store accepted masks and user corrections as anonymized, opt-in fixtures.
2. Build an ArtShift-specific validation set with thin parts, repeated products, touching objects, text, shadows, and transparent edges.
3. Fine-tune a domain-specific instance model only after the fixture set shows that zero-shot models are the remaining bottleneck.

## Decision

If the goal is the best possible result regardless of cost, choose **Option A plus Option D**: an ensemble running on a GPU worker with a human correction loop. If the goal is the best next engineering step for the current project, choose **Option B**: Fast alpha proposals, selective watershed, and prompt-based SAM-HQ refinement.

The key decision is architectural: **models propose; masks decide; the user can correct**. No single vision-language model should be allowed to define the final geometry by itself.

## Primary sources

- [Meta SAM 2 research page](https://ai.meta.com/research/publications/sam-2-segment-anything-in-images-and-videos/)
- [Meta SAM 2 repository](https://github.com/facebookresearch/segment-anything-2)
- [Meta SAM 3 research page](https://ai.meta.com/research/publications/sam-3-segment-anything-with-concepts/)
- [Meta SAM 3 product/release page](https://ai.meta.com/sam3/)
- [SAM-HQ repository](https://github.com/SysCV/sam-hq)
- [Grounding DINO paper](https://arxiv.org/abs/2303.05499)
- [Mask2Former paper](https://openaccess.thecvf.com/content/CVPR2022/papers/Cheng_Masked-Attention_Mask_Transformer_for_Universal_Image_Segmentation_CVPR_2022_paper.pdf)
- [BiRefNet repository](https://github.com/ZhengPeng7/BiRefNet)
- [OpenCV watershed documentation](https://docs.opencv.org/4.12.0/d7/d1c/tutorial_js_watershed.html)
- [OpenCV distance-transform documentation](https://docs.opencv.org/4.6.0/d2/dbd/tutorial_distance_transform.html)
- [OpenCV segmentation API](https://docs.opencv.org/4.12.0/d3/d47/group__imgproc__segmentation.html)
- [Photopea tool IDs](https://www.photopea.com/api/environment#tool-ids)
- [Pintura Retouch plugin](https://pqina.nl/pintura/docs/v8/api/plugins/retouch/)
