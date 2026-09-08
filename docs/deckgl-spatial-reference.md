# deck.gl spatial reference

The Spatial Lab was designed from the project-owner-supplied `deck.gl-master` archive (uploaded 2026-09-08).

## Source characteristics

The supplied archive identifies itself as the vis.gl `deck.gl` monorepo and declares an MIT license in `package.json`. Its README describes deck.gl as a GPU-powered framework for large-scale data visualization and frames the architecture as mapping data into composable visual layers observed through geographic or other views.

## Concepts adopted into Occu-Med Data Studio

The Spatial Lab intentionally keeps geographic analysis separate from the publication-chart editor. It adopts the layer-oriented analytical model and exposes spreadsheet-driven equivalents of these deck.gl families:

- point / scatter layers
- hexagon aggregation
- grid aggregation
- heatmap density surfaces
- contour density bands
- extruded column / grid-cell views
- arc / flow connections
- animated trip paths

The implementation in DocBOX3 is original application code built for the spreadsheet workflow. It does not copy the deck.gl source tree into production and therefore does not add the full deck.gl runtime dependency or WebGL bundle to the main application.

## Why this is a separate workspace

Datawrapper-style charts answer publication and reporting questions. The Spatial Lab answers different questions: where observations cluster, how magnitude varies geographically, where flows originate and terminate, and how movement changes across space. Keeping these functions separate prevents geographic analysis from becoming another cosmetic chart choice.
