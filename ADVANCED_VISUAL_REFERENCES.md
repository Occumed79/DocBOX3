# Advanced visualization references

The Advanced Visual Lab and Storytelling Studio were designed from source archives supplied by the project owner on 2026-09-08.

## Supplied references

- `d3mui-showcase-main` — MIT-licensed visualization gallery. Used as the feature reference for statistical, business, hierarchy, network, flow, map, and timeline visual families.
- `react-force-graph-master` — package metadata declares MIT. Used as the interaction/reference model for relationship and force-network analysis.
- `r3f-globe-master` — package metadata declares MIT. Used as the reference model for global latitude/longitude visualization and globe interaction.
- `storytelling-main` — README declares BSD 3-Clause. Used as the reference model for chapter-driven, map-linked storytelling reports.
- `cyberpunk-dashboard-main` — supplied archive did not declare a package license. It is used only as an aesthetic reference for the optional Cyberwave preview; no source files are copied into the production workspace.

## Product architecture

The primary `/vault` workspace remains the publication-focused Datawrapper-style editor. Advanced/experimental visual families are isolated at `/vault/advanced`, and scroll-driven narrative output is isolated at `/vault/story`. This keeps the reliable editor and report path stable while allowing more specialized visualization techniques to evolve independently.
