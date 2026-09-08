# Occu-Med Data Studio

DocBOX3 is now a spreadsheet visualization and report-production workspace.

## Core workflow

1. Upload `.xlsx`, `.csv`, or `.tsv` data.
2. Select the worksheet and choose which row should become the header row.
3. Rename, reorder, hide, delete, and re-type columns. Edit preview cells directly when cleanup is needed.
4. Create multiple views from the same dataset: bar, line, area, scatter, donut, ranking, KPI, and table.
5. Save multiple visualizations to the project and add selected visuals to a report.
6. Add report title, subtitle, and executive summary, reorder visuals, then print or save the report as PDF.
7. Export the cleaned dataset as CSV and save the visualization/report configuration as JSON.

## Spreadsheet parsing

The app parses CSV/TSV directly and parses `.xlsx` workbooks server-side using the ZIP/XML structure of the Office Open XML format and Node's built-in `zlib`; no external spreadsheet API is required. The current workspace limit is 30 MB per upload, 100,000 rows per sheet, and 250 columns.

## Template

The application shell follows the open-source TailAdmin free Next.js admin dashboard structure under the MIT License. See `THIRD_PARTY_NOTICES.md`.
