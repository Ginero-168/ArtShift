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
