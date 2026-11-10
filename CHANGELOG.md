# Changelog

## Unreleased

### Added

- Initial Praxilume workspace.
- Structured project and asset model.
- Versioned command envelope and actor model.
- Capability policy primitives.
- Content-addressed local asset storage.
- PhotoCraft-authenticated JSON-lines control bridge with request/response validation.
- Typed image capability crate with versioned image edits, adjustment layers and Smart Filter operations.
- `praxilume image-commands` catalog discovery command.
- Hue/Saturation, Levels, and Curves adjustment-layer operations with parameter validation.
- Smart Filter preparation, Gaussian Blur, parameter editing, visibility, ordering, deletion, and enable/disable commands.
- Root-scoped PhotoCraft open/export commands using `app.open` and `app.save`.
- Initial `praxilume.vector/v1` capability pack for rectangle, ellipse, SVG path, fill and stroke.
- Separate unauthenticated-but-loopback-only VectorCraft bridge with root-scoped open/export.
- Live VectorCraft command discovery via `engine.commands` and read-only document inspection via `document.inspect`.
- Initial FilmCraft localhost bridge for generic engine commands, command discovery and read-only sequence inspection.
- Typed `praxilume.timeline/v1` operations for add-edit, all-track add-edit, razor and clip moves, plus a normalized sequence snapshot model and dry-run mapping.
- Portable path validation for absolute paths, traversal, and drive-qualified paths.
- CI, protocol schema, security policy, roadmap, and upstream reuse documentation.
- Browser PDF workbench MVP with merge, split-to-ZIP, page extraction, page organization (reorder/rotate/delete), JPG/PNG-to-PDF, PDF-to-PNG ZIP export, and PDF page preview.
- Responsive searchable PDF tool dashboard with local file selection, drag-and-drop, file ordering, and new-file downloads.
- Wider desktop dashboard with larger cards and readable tool labels.
- Local Word-to-PDF (.docx) conversion and selectable-text PDF-to-editable-Word (.docx) conversion.
- Office conversion limits and fidelity caveats, including explicit scanned-PDF/OCR rejection.
- PDF Workbench setup guide, page-range utility tests, and a dedicated Node/Vite CI workflow.

### PDF Workbench UI and Office conversion verification

The [unified CI run](https://github.com/Chetan-code-lrca/Praxilume/actions/runs/42782742706) passed: 8 unit tests, production dependency audit, TypeScript checks, Vite build, 7 Chromium browser tests, Rust workspace checks, and the release gate. Word/PDF conversion tests verify downloaded output and local-only processing.

### Verification

Foundation CI passed rustfmt and the workspace test suite. The PhotoCraft bridge hardening passed [GitHub Actions run 38719649555](https://github.com/Chetan-code-lrca/Example2/actions/runs/38719649555). The typed image command pack passed [GitHub Actions run 38720441726](https://github.com/Chetan-code-lrca/Example2/actions/runs/38720441726): Rustfmt and workspace tests passed, with 16 unit tests and doc-test stages successful. Root-scoped PhotoCraft open/export passed [GitHub Actions run 38721088861](https://github.com/Chetan-code-lrca/Example2/actions/runs/38721088861): Rustfmt and workspace tests passed, with 20 unit tests and doc-test stages successful. Adjustment-layer and Smart Filter controls passed [GitHub Actions run 38721808097](https://github.com/Chetan-code-lrca/Example2/actions/runs/38721808097): Rustfmt and workspace tests passed, with 24 unit tests and doc-test stages successful. Initial VectorCraft support passed [GitHub Actions run 38722780911](https://github.com/Chetan-code-lrca/Example2/actions/runs/38722780911): formatting and workspace tests passed, with 32 unit tests plus doc-test stages. Live VectorCraft command discovery and read-only document inspection passed [GitHub Actions run 38724542671](https://github.com/Chetan-code-lrca/Example2/actions/runs/38724542671): formatting and workspace tests passed, with 33 unit tests plus doc-test stages. FilmCraft loopback command execution, live command discovery and sequence inspection passed [GitHub Actions run 38725127742](https://github.com/Chetan-code-lrca/Example2/actions/runs/38725127742): formatting and workspace tests passed, with 36 unit tests plus doc-test stages. Typed FilmCraft timeline operations and normalized snapshots passed [GitHub Actions run 38728091942](https://github.com/Chetan-code-lrca/Example2/actions/runs/38728091942): formatting and workspace tests passed, with 45 unit tests plus doc-test stages.


### PDF Workbench verification

The [PDF Workbench GitHub Actions run](https://github.com/Chetan-code-lrca/Praxilume/actions/runs/42774631786) passed on commit `6171e219`: all 5 utility tests passed, TypeScript type-check passed, and the Vite production build completed. This verifies the automated checks, not independent real-document/browser fidelity testing.
