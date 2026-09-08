# Wijmo integration

This project includes an actual MESCIUS Wijmo runtime integration in the Grid & Pivot Lab at `/vault/grid`.

## Authorization context

The project owner supplied `wijmo-5.20261.52` and explicitly confirmed on 2026-09-08 that the project has proper permission to use Wijmo. The project owner also confirmed that this Data Studio project is not for commercial use.

No Wijmo package source or commercial license PDF from the supplied archive is committed to this public repository. The browser workspace loads the authorized Wijmo 5 runtime from MESCIUS's official CDN. This avoids redistributing the supplied commercial package archive in the public repository while still using the real Wijmo controls.

## Actual controls used

- `wijmo.grid.FlexGrid`
- `wijmo.grid.filter.FlexGridFilter`
- `wijmo.grid.search.FlexGridSearch`
- `wijmo.grid.grouppanel.GroupPanel`
- `wijmo.olap.PivotEngine`
- `wijmo.olap.PivotPanel`
- `wijmo.olap.PivotGrid`
- `wijmo.olap.PivotChart`
- `wijmo.grid.xlsx.FlexGridXlsxConverter`

The implementation was verified against the APIs and feature samples in the owner-supplied `wijmo-5.20261.52` archive.

## Deployment configuration

By default the browser loads:

`https://cdn.mescius.com/wijmo/5.latest`

You can pin or self-host the authorized distribution by setting:

`NEXT_PUBLIC_WIJMO_CDN_BASE`

The application also supports the standard Wijmo single-build license-key mechanism:

`NEXT_PUBLIC_WIJMO_LICENSE_KEY`

When this value is configured, the browser calls `wijmo.setLicenseKey(...)` after loading the core runtime.

## Data flow

The existing `/api/data/parse` endpoint remains responsible for parsing `.xlsx`, `.csv`, and `.tsv` files. The Grid & Pivot Lab converts parsed worksheet columns into stable bindings (`c0`, `c1`, etc.) so users can rename visible headers without breaking pivot definitions or underlying data bindings.
