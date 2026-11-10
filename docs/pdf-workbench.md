# Praxilume PDF Workbench

**Status:** design approved for implementation planning; no PDF processing is implemented by this document.

## Product goal

Build a privacy-first PDF workbench under the Praxilume product family. It should make common document tasks as direct as BoringPDF while keeping the interface, command model, policy boundary, and integrations our own.

The reference is a capability benchmark, not a source to copy. We will not copy BoringPDF's branding, visual assets, copy, or implementation.

## What Praxilume has today

Praxilume is a Rust workspace with:

- a shared project and content-addressed asset model;
- the `praxilume.command/v1` command envelope and actor model;
- deny-by-default capability policy primitives;
- working image, vector, and timeline capability adapters;
- a CLI and CI verification workflow.

It does **not** currently contain a PDF engine, PDF tool catalog, or browser UI. The existing roadmap explicitly reserves a PDF/publishing capability pack. This work should extend that architecture rather than pretend the capability already exists.

## Product principles

1. **Local-first by default.** Core document operations run on the user's device. A PDF is not uploaded to a Praxilume server for processing.
2. **No account required for basic tools.** Keep the first release usable without login, cloud storage, or API keys.
3. **Originals are immutable.** Operations create a new result. Never silently overwrite the source file.
4. **Explicit network boundaries.** AI features, remote imports, and updates are separate capabilities with clear disclosure and consent.
5. **Honest safety claims.** Do not label a visual white rectangle as redaction, a drawn mark as a cryptographic signature, or a best-effort export as PDF/A conformance.
6. **Reusable commands.** UI actions, batch processing, and future agents should share stable command IDs, typed parameters, schemas, and test fixtures.

## Proposed architecture

```text
Praxilume PDF Web UI (React + TypeScript)
                 |
        praxilume.command/v1
                 |
      praxilume.pdf/v1 catalog
                 |
        PDF capability runtime
          /              \
 browser-local engine   optional local engine
 (Web Workers/WASM)     (PdfCraft CLI/API)
          \              /
           validated PDF result
                 |
      local download / project asset
```

### User interface

- React + TypeScript + Vite for a static web application.
- PDF.js for page rendering, text layer, and previews.
- Dedicated Web Workers for CPU-heavy operations so the interface remains responsive.
- Browser File APIs for selection, drag-and-drop, and downloads.
- A searchable tool directory grouped by task: Organize, Convert, Optimize, Edit, Security, and Extract.
- Keep core use available on mobile, but show clear file-size and memory limits.

The site can be hosted as static assets. The core workflow does not require a document-upload API or a database.

### PDF processing

Use replaceable engine adapters rather than coupling the UI to one library. The first implementation spike should compare:

- browser-side libraries for straightforward page composition and export;
- PdfCraft's Rust engine and its browser build;
- a local PdfCraft CLI adapter for tasks that cannot yet be run reliably in the browser.

PdfCraft is especially relevant because its upstream repository provides a WebAssembly app and a headless automation API/CLI. However, its current workspace declares Rust 1.95 while this Praxilume workspace declares Rust 1.85. Its automation crate also has filesystem-oriented operations. Do not add it as a direct workspace dependency until a small compatibility and browser-build spike proves the boundary. A process/CLI adapter or a separately built WASM artifact keeps the dependency isolated.

Any upstream reuse must preserve its applicable MIT/Apache-2.0 notices and attribution. Do not reuse upstream ArtCraft trademarks, logos, or product assets as Praxilume branding.

## First release scope

Build a small, dependable tool set before attempting feature parity with a 35-tool suite.

| Priority | Tool | Expected behavior |
|---|---|---|
| P0 | PDF viewer | Open local PDFs, render pages, zoom, navigate, show page count and metadata |
| P0 | Merge PDF | Combine multiple PDFs in user-selected order |
| P0 | Split PDF | Split by page ranges or one page per output |
| P0 | Extract pages | Export selected pages into a new PDF |
| P0 | Organize pages | Reorder, rotate, and delete selected pages |
| P0 | Image to PDF | Combine local images into a PDF with page size and fit controls |
| P0 | PDF to images | Export selected pages as PNG/JPEG |
| P1 | Extract text | Export selectable text and report pages with no extractable text |
| P1 | Add page numbers | Position, format, and page-range controls |
| P1 | Watermark | Text/image watermark with opacity, angle, and page-range controls |

**Not in the first release:** Office-format conversion, OCR, compression claims, password recovery, permanent redaction, cryptographic signing, PDF/A certification, and AI document chat. Each needs a separately verified engine and explicit acceptance tests.

## Security and privacy requirements

- Never send selected PDF bytes to Praxilume infrastructure in the default workflow.
- No analytics or session replay on document pages. Avoid logging filenames, extracted text, passwords, or document bytes.
- Add automated network-egress tests for PDF tool flows; document the allowed requests (for example, fetching static application assets).
- Keep passwords in memory only for the operation; never persist them or put them in URLs, logs, or telemetry.
- Validate file signatures and parser errors; do not trust extensions or MIME type alone.
- Set documented file-size, page-count, decompression, and memory ceilings. Fail safely without corrupting the original.
- Keep processing in a worker where possible and support cancellation.
- Treat all imported PDFs as untrusted input. Add fuzz/corpus tests and regression fixtures.
- Permanent redaction must remove or irreversibly sanitize the underlying text, images, annotations, metadata, and relevant object streams; a visual overlay is not sufficient.
- Distinguish visible signature drawing from certificate-backed digital signatures and validate outputs before claiming support.
- For sensitive workflows, show a clear summary of what stays local and what—if anything—will leave the device.

## Delivery plan

### Milestone 0 — engine and contract spike

- [ ] Inspect PdfCraft automation tools, web build, licensing, and supported browser operations.
- [ ] Prove one read-only operation and one modifying operation end-to-end in a browser worker.
- [ ] Compare memory use and output fidelity against representative PDFs.
- [ ] Define `praxilume.pdf/v1` command IDs and JSON Schemas.
- [ ] Record the selected engine boundary and its MSRV/build constraints.

### Milestone 1 — reliable local basics

- [ ] Build the static web shell and responsive searchable tool directory.
- [ ] Implement viewer, merge, split, extract, reorder, rotate, delete, and image/PDF conversion.
- [ ] Add fixtures for malformed, encrypted, image-heavy, and large files.
- [ ] Verify output opens in independent PDF viewers and original files remain unchanged.
- [ ] Add automated network-egress checks and browser smoke tests.

### Milestone 2 — productivity tools

- [ ] Add text extraction, page numbers, watermark, and reusable workflows.
- [ ] Add batch operations with per-file results and cancellation.
- [ ] Connect successful operations to Praxilume asset identity and provenance.

### Milestone 3 — advanced document workflows

- [ ] Evaluate OCR and searchable-PDF generation.
- [ ] Evaluate lossless and image-aware compression with measurable output comparisons.
- [ ] Implement and independently verify true redaction before exposing it.
- [ ] Evaluate digital signatures, metadata sanitization, PDF/A, document comparison, and optional BYOK AI one by one.

## Definition of done

A tool is not complete because a button exists. It is complete only when:

1. its schema, validation, and failure states are defined;
2. the source document is preserved;
3. its output passes automated structural checks and opens in an independent viewer;
4. it has unit, integration, and representative-corpus tests;
5. its browser network behavior matches the privacy claim;
6. its limits and unsupported cases are visible to the user; and
7. the README and changelog describe the actual tested capability.
