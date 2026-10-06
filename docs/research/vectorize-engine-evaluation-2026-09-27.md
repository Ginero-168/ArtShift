# Vectorize engine evaluation for ArtShift

Verified: 2026-09-27 UTC. Primary-source research; no paid calls, engine benchmark, or app changes performed. The selection and acceptance criteria below are recommendations, not measured results.

## Decision

Build one Vectorize Studio around the existing local VTracer and cloud Recraft adapters. Select candidates by artwork type, then judge the imported, editable result—not merely the provider's SVG preview. Keep conversion faithful by default; generative redraw is a separate user intent. There is no evidence here that one engine wins for every input.

ArtShift already pins `vtracer = "=1.0.0-alpha.4"` in [its browser binding](../../wasm/vtracer-browser/Cargo.toml), and [its cloud route](../../app/api/vectorize/recraft/route.ts) selects Replicate's `recraft-vectorize`. Therefore the proposal is orchestration, geometry preservation, quality measurement, and editing improvements; it is not a proposal to add an already-present VTracer version. Existing engineering context: [WASM research](../vtracer-wasm-research.md), [quality tuning](../vtracer-quality-tuning.md).

## Verified engine facts and implications

### VTracer: primary local engine

The upstream README documents color and binary tracing, polygon/pixel/spline fitting, stacked or shared-boundary cutout geometry, palette constraints, automatic color reduction, adaptive thresholding, watershed segmentation, and tolerance-based curve simplification. Its Rust pipeline can cache segmentation separately from finishing. These capabilities are useful for fast repeated adjustments; they do not prove perceptual superiority. [Official README](https://github.com/visioncortex/vtracer)

The release list identifies `1.0.0-alpha.4`, so pin artifacts and rerun regressions before upgrades. [Releases](https://github.com/visioncortex/vtracer/releases)

The pinned workspace declares `MIT OR Apache-2.0`; the repository's top-level license contains MIT terms, including notice preservation. Record the chosen license and bundled dependency notices. [Pinned manifest](https://raw.githubusercontent.com/visioncortex/vtracer/1.0.0-alpha.4/Cargo.toml), [license](https://raw.githubusercontent.com/visioncortex/vtracer/master/LICENSE)

The official npm wrapper targets Node.js via `wasm-pack --target nodejs`; do not substitute it for ArtShift's browser binding merely because both use WASM. [Pinned package manifest](https://raw.githubusercontent.com/visioncortex/vtracer/1.0.0-alpha.4/nodejs/package.json)

Recommendation: retain a local, cancellable Worker path. Start flat artwork with cutout; compare polygon and spline where corners matter. Cache preprocessing/segmentation when supported by the actual binding. Only enable simplification after measuring lost holes, thin strokes, and boundary drift. Existing alpha.4 support is a foundation, not evidence that every upstream option is exposed by ArtShift.

### Recraft: existing cloud alternative; direct API is a separate deployment option

Recraft documents `POST /v1/images/vectorize`, which converts raster input to SVG. This is distinct from image-generation endpoints and does not ask for a generative prompt. Documented inputs: PNG/JPG/WebP, at most 10 MB and 16 MP, maximum dimension 4096 px, minimum dimension 256 px. The vectorize section does not expose VTracer-style detail, palette, or curve-fitting controls. These are direct Recraft API facts, not assumed Replicate limits. [Endpoint documentation](https://www.recraft.ai/docs/api-reference/endpoints#vectorize-image)

Direct vectorization currently costs **$0.01 per request**; that is not ArtShift's verified Replicate cost. [API pricing](https://www.recraft.ai/docs/api-reference/pricing)

Recraft's privacy documentation states API inputs and outputs are excluded from model training. Do not extend that promise to another hosting intermediary without checking its policy. [Data-use documentation](https://www.recraft.ai/docs/trust-and-security/data-use-and-model-training)

Recommendation: benchmark the existing Replicate path first. Add a direct adapter only for a demonstrated reliability, latency, privacy, or cost gain. Conversion intent does not guarantee exact fidelity: validate typography, alpha, small holes, gradients, and actual editor import. Preserve source artwork and require preview acceptance before replacement.

### Vectorizer.AI: technically relevant, contract-dependent candidate

Its API supports palette remapping, maximum colors, shape-area filtering, stacking/grouping, and several export formats. Default gap-filling can introduce mixed colors even with a limited palette. Input uploads can reach 33,554,432 pixels but are resized to a configured processing maximum; the documented default is 2,097,252 pixels. Production vectorization costs one credit; previews cost 0.2 and upgrading a preview costs another 0.9. Free test modes are watermarked. [API documentation](https://vectorizer.ai/api/documentation)

Export controls include curve types, primitive flattening, size, and compatibility settings. Useful to an adapter, but unsupported geometry must survive ArtShift import before it counts as usable. [Output options](https://vectorizer.ai/api/outputOptions)

API plans are separate from the human-facing Web App subscription, with unused credits rolling over up to five times monthly credits. The USD search snapshot showed 50 credits for $9.99/month; the opened page localized prices to PLN. Use checkout currency and current plan for budgeting rather than treating this snapshot as a quote. [Pricing](https://vectorizer.ai/pricing)

**Concrete selection constraint:** the current Terms restrict third-party API proxying/multiplexing and prohibit certain AI/ML benchmarking and competitive-development uses of results without written consent. This sits uneasily with documentation advertising customer-facing API workflows. Resolve the applicable API agreement before adding this provider to an ArtShift benchmark or production router. This is an unresolved contractual fit, not a claim that all commercial vectorization use is prohibited. [Terms, API and AI-use sections](https://vectorizer.ai/policies/terms)

### Potrace and diffvg: specialist options, not default replacements

Potrace is principally a bitmap-outline tracer. Upstream licenses it under GPL version 2 or later and offers a separate non-GPL Potrace Professional license for proprietary integration. Evaluate monochrome fidelity if needed, with licensing resolved for the chosen distribution model. [Official project and licensing](https://potrace.sourceforge.net/)

diffvg is a differentiable rasterizer with an example that refines an existing SVG toward a raster target. It uses a Python/PyTorch/native stack and is licensed Apache-2.0. [Repository and refinement example](https://github.com/BachiLi/diffvg), [license](https://raw.githubusercontent.com/BachiLi/diffvg/master/LICENSE)

Recommendation: keep diffvg as later server-side refinement research. A differentiable loss alone does not supply correct object boundaries, topology, readable text, or a responsive editing experience. Test it only after deterministic tracing and geometry preservation work well.

## Benchmark that can select a winner

Use owned or licensed inputs and permitted providers. The consolidated [Studio design](../plans/vectorize-studio-design-th.md) proposes 240 fixtures: 30 each of flat logos, Thai/Latin wordmarks, line art, icons, flat illustrations, gradient artwork, pixel art, and photos. Split each category into 20 tuning and 10 blind holdout inputs. Add transparent/soft-edge assets, degraded scans, and adversarial geometry to separate stress fixtures; include known SVG originals rasterized with controlled noise so topology and geometry have reference truth. Preserve difficult low-resolution and large inputs rather than testing only pristine icons.

Compare the current ArtShift output against proposed local profiles and eligible cloud adapters using identical source bytes, documented resizing, and a fixed time/cost budget. Record versions, parameters, hashes, processing dimensions, and every failed or cancelled job. Separate cold start from warm runs.

Measure these dimensions independently:

- **Visual fidelity:** alpha-aware raster comparisons on white, black, and checker backgrounds; edge displacement; color error; inspection at 100% and 800%. SSIM alone can reward a blurry result.
- **Structural correctness:** hole/component preservation, boundary gaps and overlaps, winding and clipping, and exact brand colors. Evaluate Thai marks and small counters separately.
- **Editability:** shapes/nodes, usable groups, palette changes, selected-region repair, and manual cleanup time. An SVG with a raster image embedded is not a successful vector result.
- **Operational quality:** p50/p95 latency, peak memory, cancellation latency, output bytes, import failures, billable attempts, and editor responsiveness after import.
- **Human usefulness:** blinded comparison by artwork category; success means a designer would deliver the output with less cleanup, not simply choose a visually attractive thumbnail.

Use hard gates for malformed/unsupported geometry, missing transparency, lost protected text/counters, and exceeded resource budgets. Rank surviving candidates on a Pareto frontier of fidelity, editability, latency, and cost; let the user select Detail versus Fewer Points when neither dominates. Set numerical release thresholds after baseline measurement. Do not present a synthetic quality percentage as a measured score.

## Architecture consequences

Normalize every adapter into one versioned vector document containing geometry, fill rules, transforms, paint, hierarchy, source linkage, and provenance. Preserve the original SVG for comparison, but only approved geometry enters editable state. Render the normalized document and compare it with the provider SVG; importer damage must fail the job even if provider output is excellent.

Keep ArtShift's atomic canvas object and open its internal shapes in Vectorize Studio. Generate two or three bounded local candidates rather than calling every provider automatically. Show actual pixels used and result complexity; never silently call a reduced-resolution trace “full detail.” Use local output for immediate preview, optional authorized cloud processing for a candidate, and stale-result protection for every async job. Preserve the last successful result on failure or cancellation.

The immediate quality investment is source-aware preprocessing, shared boundaries, topology-preserving import, controlled simplification, and clear region repair. Provider substitution becomes a measured decision after those foundations are in place.
