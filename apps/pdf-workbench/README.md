# Praxilume PDF Workbench

A simple, local-first PDF tools interface built as part of the Praxilume project.

## Run locally

Requirements: Node.js 20.19 or newer and npm.

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
| Split PDF | Split a PDF into page-count chunks and download them as a ZIP |
| Extract Pages | Export selected page ranges to a new PDF |
| Organize Pages | Reorder, rotate, and remove pages |
| Images to PDF | Turn JPG/PNG images into a PDF |
| PDF to Images | Render selected pages to PNG files in a ZIP |
| PDF Viewer | Preview a PDF page-by-page in the browser |

Page ranges accept examples such as `1, 3, 5-8`. Page numbers are one-based.

## Verify

```bash
npm run test
npm run build
```

The build runs TypeScript checks before Vite creates the static site in `dist/`.

## Privacy and limits

- PDF and image bytes are read by the browser from files the user explicitly selects.
- This app does not include a document-upload API, account system, analytics, or cloud-processing backend.
- The original input files are never overwritten; generated results are downloaded as new files.
- PDF input is currently limited to 100 MB per file. Image input is limited to 25 MB per image. PDF-to-image export is limited to 100 selected pages, and page organization is limited to 500 pages.
- Password-protected PDFs are not supported in this MVP.
- Large files can consume significant browser memory. Close the tool when finished, and verify important documents with an independent PDF viewer.

The current release does **not** claim to support compression, OCR, Office conversion, permanent redaction, cryptographic signatures, unlocking, or PDF/A certification. These will be added only after their processing and output can be independently verified.

## Architecture

- **Vite + TypeScript:** static browser application.
- **pdf-lib:** PDF page copying, assembly, rotation, and image embedding.
- **PDF.js:** PDF page rendering and preview.
- **JSZip:** package multi-file outputs for a single download.

Core document operations run in the browser. Hosting serves the application assets; selected document bytes are not sent to the hosting server.
