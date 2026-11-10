# Praxilume PDF Workbench

**Status:** browser MVP implemented on `feat/pdf-workbench-foundation`. The PDF-specific CI workflow runs unit tests and a production build; independent real-file browser QA and output-fidelity validation are still required before calling this production-ready.

## Product goal

Build a privacy-first PDF workbench under the Praxilume product family. Its interface should stay direct: a small brand bar, clear heading, search, and a grid of task cards. The initial implementation follows the supplied compact dashboard reference without copying another product's visual assets or branding.

The reference is a capability benchmark, not a source to copy. We will not copy BoringPDF's branding, visual assets, copy, or implementation.

## What exists today

Praxilume is a Rust workspace with:

- a shared project and content-addressed asset model;
- the `praxilume.command/v1` command envelope and actor model;
- deny-by-default capability policy primitives;
- working image, vector, and timeline capability adapters;
- a separate browser PDF workbench at [`apps/pdf-workbench`](../apps/pdf-workbench/README.md).

The browser MVP is intentionally isolated from the Rust workspace. The Rust core does not yet expose a `praxilume.pdf/v1` command catalog, persistent asset integration, or an agent API for PDF operations.

## Product principles

1. **Local-first by default.** Core document operations run in the user's browser. Selected PDF bytes are not sent to a Praxilume processing server.
2. **No account required for basic tools.** The browser MVP needs no login, cloud storage, or API keys.
3. **Originals are immutable.** Operations create new downloaded results and never overwrite the source file.
4. **Explicit network boundaries.** AI features, remote imports, and updates are separate capabilities with clear disclosure and consent.
5. **Honest safety claims.** Do not label a visual white rectangle as redaction, a drawn mark as a cryptographic signature, or a best-effort export as PDF/A conformance.
6. **Reusable commands.** Future CLI, agent, and UI features should share stable command IDs, typed parameters, schemas, and test fixtures.

## Current browser architecture

```text
Praxilume PDF static web app (Vite + TypeScript)
                    |
          Browser File / Download APIs
                    |
          PDF operations in the browser
             /          |          \
          pdf-lib     PDF.js       JSZip
        page edits   preview      ZIP output
             \          |          /
               new local result
                    |
                 download
```


### Office conversion limitations

- **Word to PDF:** accepts .docx only. Mammoth converts semantic document content to HTML, DOMPurify sanitizes the result, and html2pdf.js renders it locally. Tables, headings, lists, and embedded images are supported where the source can be represented in HTML. Complex positioning, headers/footers, tracked changes, and advanced page layout may differ. The current HTML-to-PDF renderer embeds rasterized page content, so output text is not searchable/selectable.
- **PDF to Word:** extracts text from text-based PDFs with PDF.js and creates a reflowable .docx with the docx package. It does not reconstruct exact columns, tables, images, charts, fonts, or original pagination. PDFs without selectable text are rejected; OCR is not included.
- Both conversions run locally in the browser and do not send document bytes to a Praxilume server. The input file is not modified.
- Word conversion input is capped at 20 MB; PDF-to-Word is capped at 250 pages. These browser-side limits protect against excessive memory use, not guarantee conversion fidelity.

### User interface

- Vite + TypeScript, with no frontend framework required for this compact UI.
- Responsive dark dashboard with search, category filters, and seven tool cards.
- Native file picker and drag-and-drop.
- Simple operation dialog, visible progress/result message, and page-range fields.
- Desktop and mobile layouts.
- No account, document-upload API, or database.

### PDF processing

The first browser MVP uses three focused libraries:

- **pdf-lib** for merge, split, extract, reorder, rotate, delete, and image embedding.
- **PDF.js** for PDF viewing and page-to-PNG rendering. PDF.js uses its worker for document parsing/rendering.
- **JSZip** for multi-file downloads from split and PDF-to-image tools.

This keeps the everyday MVP dependency small and browser-only. It is not an implementation of every PDF feature. pdf-lib page-edit operations currently run in the main browser thread; moving heavier operations to a dedicated worker is a later performance improvement.

[PdfCraft](https://github.com/storytold/pdfcraft) remains a candidate provider for more advanced operations. Its Rust engine and browser build have been inspected, but it is not bundled into this first MVP. A future adapter must demonstrate browser compatibility, memory limits, fidelity, and a safe filesystem boundary before integration. Praxilume's workspace currently declares Rust 1.85 while the upstream PdfCraft workspace declares Rust 1.95, which is another reason to keep them isolated for now.

Any upstream reuse must preserve its applicable MIT/Apache-2.0 notices and attribution. Do not reuse upstream ArtCraft trademarks, logos, or product assets as Praxilume branding.

## Browser MVP capability scope

| Tool | Current behavior |
|---|---|
| Merge PDF | Combine two or more PDFs in the displayed file order |
| Split PDF | Split by pages-per-file and download all parts as a ZIP |
| Extract Pages | Export page numbers/ranges such as `1, 3, 5-8` |
| Organize Pages | Move pages up/down, rotate clockwise, and remove pages |
| Images to PDF | Build a PDF from JPG/PNG images |
| PDF to Images | Render selected PDF pages to PNG files in a ZIP |
| PDF Viewer | Preview one page at a time with previous/next controls |

The current documented limits are 100 MB per PDF, 25 MB per image, 100 exported pages per PDF-to-image job, and 500 pages in the page organizer. Password-protected PDFs are not supported by this MVP.

**Not implemented:** standalone text extraction, page numbers, watermark, compression, OCR, password unlocking/protection, permanent redaction, cryptographic signing, PDF/A certification, PDF comparison, and AI document chat. Office conversion is an early best-effort browser feature with the limits below. Each requires a separately verified engine and acceptance tests.

## Security and privacy requirements

- Never send selected PDF bytes to Praxilume infrastructure in the default workflow.
- No analytics or session replay on document pages. Avoid logging filenames, extracted text, passwords, or document bytes.
- Add automated network-egress tests for PDF tool flows; document allowed requests (for example, fetching static app assets).
- Password handling must be added only alongside a tested encrypted-PDF implementation. Never persist passwords or put them in URLs, logs, or telemetry.
- Validate file signatures and parser errors; do not trust extensions or MIME type alone.
- Keep documented file-size, page-count, decompression, and memory ceilings. Fail safely without corrupting originals.
- Keep expensive processing in a worker where practical and support cancellation.
- Treat imported PDFs as untrusted input. Add fuzz/corpus tests and regression fixtures.
- Permanent redaction must remove or irreversibly sanitize the underlying text, images, annotations, metadata, and relevant object streams; a visual overlay is not sufficient.
- Distinguish visible signature drawing from certificate-backed digital signatures and validate outputs before claiming support.

## Delivery plan

### Milestone 0 — browser MVP foundation

- [x] Select an isolated browser engine boundary for the basic MVP: pdf-lib + PDF.js + JSZip.
- [x] Build the responsive static web shell and searchable tool directory.
- [x] Add local file selection, drag-and-drop, file ordering, and download flows.
- [x] Add page-range parsing and unit tests.
- [x] Add first-pass local Word/PDF conversion flows with browser coverage.
- [ ] Complete independent real-file browser QA and output-fidelity comparisons.

### Milestone 1 — reliable local basics

- [x] Implement merge, split, extract, reorder, rotate, delete, image-to-PDF, PDF-to-PNG, and page preview.
- [ ] Add fixtures for malformed, encrypted, image-heavy, and large files.
- [ ] Verify representative outputs open in independent PDF viewers and originals remain unchanged.
- [x] Add automated browser smoke tests for merge, viewer, both Office conversions, and no-document-egress checks.
- [ ] Add a larger real-file regression corpus and test more DOCX layout features.
- [ ] Add a reproducible lockfile after dependency/build verification.

### Milestone 2 — productivity tools

- [ ] Add text extraction, page numbers, watermark, and reusable workflows.
- [ ] Add batch operations with per-file results and cancellation.
- [ ] Connect successful operations to Praxilume asset identity and provenance.
- [ ] Move expensive page operations off the UI thread where benchmarks show a benefit.

### Milestone 3 — advanced document workflows

- [ ] Evaluate OCR and searchable-PDF generation.
- [ ] Evaluate lossless and image-aware compression with measurable output comparisons.
- [ ] Implement and independently verify true redaction before exposing it.
- [ ] Evaluate digital signatures, metadata sanitization, PDF/A, document comparison, and optional BYOK AI one by one.
- [ ] Evaluate PdfCraft as an isolated advanced engine provider.

## Definition of done

A tool is not complete because a button exists. It is complete only when:

1. its schema, validation, and failure states are defined;
2. the source document is preserved;
3. its output passes automated structural checks and opens in an independent viewer;
4. it has unit, integration, and representative-corpus tests;
5. its browser network behavior matches the privacy claim;
6. its limits and unsupported cases are visible to the user; and
7. the README and changelog describe the actual tested capability.
