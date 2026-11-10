
# Praxilume PDF Workbench

A simple, local-first PDF tools interface built as part of the Praxilume project.

## Run locally

Requirements: Node.js 24 and npm.

```bash
cd apps/pdf-workbench
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Available tools

| Tool | What it does |
|---|---|
| Merge PDF | Combine PDFs in the order shown in the file list |
| Split PDF | Split by page count and download the parts as a ZIP |
| Extract Pages | Export selected page ranges to a new PDF |
| Organize Pages | Reorder, rotate, and remove pages |
| Images to PDF | Turn JPG/PNG images into a PDF |
| PDF to Images | Export selected pages to PNG files in a ZIP |
| PDF Viewer | Preview a PDF page-by-page in the browser |

Page ranges accept examples such as `1, 3, 5-8`. Page numbers are one-based.

## Tests and production build

```bash
npm run test
npm run build
npm run test:e2e
```

The Playwright browser tests run against the built static site and validate dashboard search, merge output, invalid page-range handling, the page viewer, and the no-document-egress assertion in the merge flow.

## Deployment and CI/CD

The Vercel project `praxilume-pdf` is linked to this repository with its root directory set to `apps/pdf-workbench`.

- Every branch push and pull request receives a Vercel Preview Deployment.
- The production branch is `main`; a merge/push to `main` triggers the production deployment.
- One GitHub Actions workflow runs the Rust workspace checks and PDF workbench checks in parallel, followed by a `Release gate` job that fails unless both pass. The PDF job runs a production dependency audit, unit tests, TypeScript checks, a production build, and Playwright Chromium smoke tests.
- Preview deployments are protected by Vercel Authentication. The production URL is publicly accessible.
- For a release, require the single `CI / Release gate` status check before merging to `main`. Configure this in GitHub under **Settings → Rules → Rulesets** (or **Settings → Branches**) for the `main` branch. In Vercel, configure **Deployment Checks** to require the same GitHub Actions check before production promotion.

## Privacy and limits

- PDF and image bytes are read by the browser from files the user explicitly selects.
- This app does not include a document-upload API, account system, analytics, or cloud-processing backend.
- The original input files are never overwritten; generated results are downloaded as new files.
- PDF input is currently limited to 100 MB per file. Image input is limited to 25 MB per image. PDF-to-image export is limited to 100 selected pages, and page organization is limited to 500 pages.
- Password-protected PDFs are not supported by this MVP.
- Large files can consume significant browser memory. Close the tool when finished, and verify important documents with an independent PDF viewer.

The current release does **not** claim to support compression, OCR, Office conversion, permanent redaction, cryptographic signatures, unlocking, or PDF/A certification. These will be added only after their processing and output can be independently verified.

## Architecture

- **Vite + TypeScript:** static browser application.
- **pdf-lib:** page composition, page organization, and image embedding.
- **PDF.js:** PDF page rendering and preview.
- **JSZip:** package multi-file outputs for a single download.
- **Playwright:** end-to-end browser smoke tests.

Core document operations run in the browser. Hosting serves the application assets; selected document bytes are not sent to the hosting server.
