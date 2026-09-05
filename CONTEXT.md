# ArtShift Editor

ArtShift Editor composes promotional artwork from reusable content and media while preserving enough freedom for designers to refine the result.

## Language

**Artwork**:
The bounded visual surface that is exported as one promotional design.
_Avoid_: Canvas, page, workspace

**Workspace**:
The editing environment around the Artwork, including its tools, Layers, and placement rules.
_Avoid_: Canvas

**Layer**:
An ordered container that owns one or more Objects and gives all of them the same placement behavior, visibility, and lock state.
_Avoid_: Object, element

**Object**:
An editable piece of content inside a Layer, such as text, an image, a shape, or a book mockup.
_Avoid_: Layer, block

**Block layer**:
A Layer whose Objects occupy auto-arranged hexagonal cells and make room according to Workspace Strictness.
_Avoid_: Grid layer, Bento layer

**Free layer**:
A Layer whose Objects keep exact coordinates and may overlap without automatic rearrangement.
_Avoid_: Floating layer

**Block**:
A reusable Object recipe from the library, such as a title, price, cover, or call to action.
_Avoid_: Layer, cell

**Workspace Strictness**:
The shared placement tolerance that determines how many hexagonal cells Block-layer Objects may overlap.
_Avoid_: Grid strength, snap level

## Visual Orchestration Vocabulary

**Visual Intent**:
The user's requested visual outcome or change, before a model or tool is selected.

**Task Class**:
The scope of a Visual Intent: **simple** for one clear reversible outcome, or **complex** for coordinated outputs, references, typography, or multi-part design work.

**Capability Alias**:
A stable semantic ability such as `IMAGE_DEFAULT`, `IMAGE_EDIT`, `IMAGE_TEXT`, or `VISION_DEFAULT`; it is not a provider name or raw model id.

**Canonical Artifact**:
The most recent version of an Artwork that the user accepted as the basis for the next revision.

**Immutable Element**:
An identity, logo, brand color, required copy, or other approved property that a revision must preserve.

**Mutable Element**:
A property that the current Visual Intent explicitly permits changing, such as crop, pose, background, lighting, or decoration.
