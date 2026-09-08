# Grid & Pivot Lab

`/vault/grid` is an original React/TypeScript spreadsheet exploration and pivot-analysis workspace built for Occu-Med Data Studio.

The interaction model was informed by mature spreadsheet and OLAP tools, including the project-owner-supplied Wijmo reference package, but the production implementation does not load, bundle, call, or depend on Wijmo/MESCIUS runtime code.

## Grid workflow

- Upload `.xlsx`, `.csv`, or `.tsv` through the shared Data Studio parser.
- Choose workbook sheet and header row.
- Rename headers without changing stable internal field ids.
- Convert field types: text, number, date, boolean.
- Hide, delete, and reorder columns.
- Freeze leading visible columns.
- Global search plus per-column filters.
- Sort ascending/descending from headers.
- Group the filtered dataset by any field.
- Edit cells directly.
- Export the current filtered view to CSV.

## Pivot workflow

- Assign row, column, and measure fields.
- Aggregate by count, sum, average, minimum, or maximum.
- Optionally analyze only the current filtered grid view.
- Inspect a pivot chart of the leading row groups.
- Click a pivot value to drill into the exact contributing source rows.
- Save and restore the active pivot definition in local browser storage.
- Export pivot results to CSV.

## Runtime policy

The Grid & Pivot Lab must remain independent of proprietary spreadsheet-control runtimes. The Data Studio verification script explicitly fails if Wijmo/MESCIUS runtime references or the removed integration files reappear.
