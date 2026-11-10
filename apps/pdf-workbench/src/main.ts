import { degrees, PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import JSZip from "jszip";
import DOMPurify from "dompurify";
import * as mammoth from "mammoth";
import html2pdf from "html2pdf.js";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { extractPdfTextLines, formatBytes, MAX_PDF_BYTES, parsePageRanges, safePdfName } from "./pdf-utils";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const MAX_DOCX_BYTES = 20 * 1024 * 1024;
const MAX_WORD_EXPORT_PAGES = 250;

type ToolId =
  | "merge"
  | "split"
  | "extract"
  | "organize"
  | "images-to-pdf"
  | "pdf-to-images"
  | "word-to-pdf"
  | "pdf-to-word"
  | "viewer";

type ToolCategory = "Organize PDF" | "Convert" | "View";

interface Tool {
  id: ToolId;
  title: string;
  description: string;
  category: ToolCategory;
  accept: string;
  multiple: boolean;
  action: string;
}

const TOOLS: Tool[] = [
  {
    id: "merge",
    title: "Merge PDF",
    description: "Combine multiple PDF files into one document.",
    category: "Organize PDF",
    accept: ".pdf,application/pdf",
    multiple: true,
    action: "Merge PDFs"
  },
  {
    id: "split",
    title: "Split PDF",
    description: "Divide a PDF into smaller files by page count.",
    category: "Organize PDF",
    accept: ".pdf,application/pdf",
    multiple: false,
    action: "Split PDF"
  },
  {
    id: "extract",
    title: "Extract Pages",
    description: "Save only the pages you need in a new PDF.",
    category: "Organize PDF",
    accept: ".pdf,application/pdf",
    multiple: false,
    action: "Extract pages"
  },
  {
    id: "organize",
    title: "Organize Pages",
    description: "Reorder, rotate, or remove pages from a PDF.",
    category: "Organize PDF",
    accept: ".pdf,application/pdf",
    multiple: false,
    action: "Save changes"
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Turn JPG and PNG images into a single PDF.",
    category: "Convert",
    accept: ".jpg,.jpeg,.png,image/jpeg,image/png",
    multiple: true,
    action: "Create PDF"
  },
  {
    id: "pdf-to-images",
    title: "PDF to Images",
    description: "Export PDF pages as PNG images in a ZIP file.",
    category: "Convert",
    accept: ".pdf,application/pdf",
    multiple: false,
    action: "Convert pages"
  },
  {
    id: "word-to-pdf",
    title: "Word to PDF",
    description: "Convert a .docx document into a print-ready PDF.",
    category: "Convert",
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: false,
    action: "Convert to PDF"
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    description: "Create an editable .docx from selectable PDF text.",
    category: "Convert",
    accept: ".pdf,application/pdf",
    multiple: false,
    action: "Convert to Word"
  },
  {
    id: "viewer",
    title: "PDF Viewer",
    description: "Open a PDF, preview pages, and move through it.",
    category: "View",
    accept: ".pdf,application/pdf",
    multiple: false,
    action: "Open PDF"
  }
];

const ICONS: Record<ToolId, string> = {
  merge: '<path d="M8 7h8M8 12h8M8 17h8"/><path d="M5 4h14v16H5z"/><path d="M12 9v6m-3-3h6"/>',
  split: '<path d="M4 6h6l10 12"/><path d="M4 18h6L20 6"/><path d="M4 6v12"/>',
  extract: '<path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h3"/><path d="m16 14 3 3-3 3"/>',
  organize: '<path d="M4 5h16M4 12h16M4 19h16"/><path d="m8 3-3 2 3 2m8 3 3 2-3 2"/>',
  "images-to-pdf": '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m20 15-5-5L6 20"/>',
  "pdf-to-images": '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/><rect x="8" y="12" width="8" height="6" rx="1"/><path d="m9 17 2-2 2 2 1-1 2 2"/>',
  "word-to-pdf": '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/><path d="m8 12 1.5 5 1.5-4 1.5 4 1.5-5"/>',
  "pdf-to-word": '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/><path d="M8 12h8M8 15h6M8 18h7"/>',
  viewer: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>'
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root was not found.");

let activeCategory = "All";
let activeQuery = "";
let activeTool: Tool | null = null;
let selectedFiles: File[] = [];
let pageOrder: number[] = [];
let rotations = new Map<number, number>();
let viewerDocument: pdfjsLib.PDFDocumentProxy | null = null;
let viewerLoadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
let viewerPageNumber = 1;
let busy = false;

function renderApp(): void {
  const visibleTools = TOOLS.filter((tool) => {
    const matchesCategory = activeCategory === "All" || tool.category === activeCategory;
    const haystack = `${tool.title} ${tool.description} ${tool.category}`.toLowerCase();
    return matchesCategory && haystack.includes(activeQuery.toLowerCase());
  });

  app!.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Praxilume PDF home">
          <span class="brand-mark">P</span>
          <span>Praxilume <small>PDF</small></span>
        </a>
        <div class="top-actions">
          <button class="text-link" id="aboutButton" type="button">About</button>
          <button class="text-link" id="privacyButton" type="button">Privacy</button>
        </div>
      </header>

      <section class="hero">
        <p class="eyebrow">Simple tools. Your files stay yours.</p>
        <h1>PDF Tools</h1>
        <p>Select a tool and get started. No account or upload required.</p>
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          <input class="search-input" id="toolSearch" type="search" autocomplete="off" placeholder="Search for a tool (e.g. split, organize…)" value="${escapeHtml(activeQuery)}" aria-label="Search PDF tools" />
          <span class="search-hint">Ctrl K</span>
        </div>
        <div class="trust-row" aria-label="Privacy highlights">
          <span class="trust-icon">◈</span><span>Local processing</span>
          <span class="trust-icon">⌁</span><span>No account</span>
          <span class="trust-icon">✓</span><span>Free to use</span>
        </div>
      </section>

      <section class="tools-section">
        <div class="section-head">
          <h2>Popular Tools</h2>
          <span class="tool-count">${visibleTools.length} available</span>
        </div>
        <div class="filters" role="group" aria-label="Filter tools">
          ${["All", "Organize PDF", "Convert", "View"].map((category) => `
            <button type="button" class="filter-chip ${activeCategory === category ? "active" : ""}" data-category="${category}">${category}</button>
          `).join("")}
        </div>
        <div class="tool-grid">
          ${visibleTools.length ? visibleTools.map(renderToolCard).join("") : '<div class="empty-state">No tools match that search. Try a different word.</div>'}
        </div>
      </section>

      <footer class="footer">
        <span><strong>Praxilume PDF</strong> · A local-first PDF workbench</span>
        <span>Files are processed in this browser. Originals are never overwritten.</span>
      </footer>
    </div>
  `;

  document.querySelector<HTMLInputElement>("#toolSearch")?.addEventListener("input", (event) => {
    activeQuery = (event.target as HTMLInputElement).value;
    const cursor = (event.target as HTMLInputElement).selectionStart;
    renderApp();
    const search = document.querySelector<HTMLInputElement>("#toolSearch");
    search?.focus();
    if (cursor !== null && search) search.setSelectionRange(cursor, cursor);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category ?? "All";
      renderApp();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = TOOLS.find((item) => item.id === button.dataset.tool);
      if (tool) openTool(tool);
    });
  });

  document.querySelector<HTMLButtonElement>("#aboutButton")?.addEventListener("click", () => {
    showInfo("About Praxilume PDF", "Praxilume PDF is a small, browser-based document workbench. This first release focuses on practical everyday tasks: merging, splitting, extracting, organizing, and converting PDFs. More tools will be added only when they can be implemented and tested reliably.");
  });
  document.querySelector<HTMLButtonElement>("#privacyButton")?.addEventListener("click", showPrivacy);
}

function renderToolCard(tool: Tool): string {
  return `
    <button class="tool-card" type="button" data-tool="${tool.id}">
      <span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[tool.id]}</svg></span>
      <span class="tool-title">${tool.title}</span>
      <span class="tool-desc">${tool.description}</span>
    </button>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function openTool(tool: Tool): void {
  activeTool = tool;
  selectedFiles = [];
  pageOrder = [];
  rotations = new Map();
  viewerDocument = null;
  viewerPageNumber = 1;
  busy = false;

  const settings = settingsFor(tool.id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "toolModal";
  modal.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <header class="modal-head">
        <div>
          <p class="modal-kicker">${tool.category}</p>
          <h2 id="modalTitle">${tool.title}</h2>
          <p class="modal-subtitle">${tool.description}</p>
        </div>
        <button class="icon-button" id="closeModal" type="button" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <div class="dropzone" id="dropzone">
          <div class="drop-icon">⇧</div>
          <p class="drop-title">${tool.multiple ? "Drop your files here" : "Drop your file here"}</p>
          <p class="drop-hint">${tool.multiple ? "Choose one or more files. Their order is preserved." : "Choose a file from your device."}</p>
          <button class="secondary-button" id="pickFiles" type="button">Choose ${tool.multiple ? "files" : "file"}</button>
          <input class="file-input" id="fileInput" type="file" accept="${tool.accept}" ${tool.multiple ? "multiple" : ""} />
        </div>
        <div class="selected-files" id="selectedFiles" aria-live="polite"></div>
        ${settings}
        ${tool.id === "organize" ? '<div class="page-list" id="pageList"></div><div style="margin-top:9px"><button class="secondary-button" id="resetPages" type="button">Reset page order</button></div>' : ""}
        ${tool.id === "viewer" ? '<div class="viewer-controls"><button class="secondary-button" id="prevPage" type="button" disabled>Previous</button><span class="viewer-page-label" id="viewerPageLabel">Select a PDF to preview</span><button class="secondary-button" id="nextPage" type="button" disabled>Next</button></div><div class="viewer-stage" id="viewerStage"><span class="drop-hint">Your PDF preview will appear here.</span></div>' : ""}
        <div class="privacy-note"><span>✓</span><span>Your file is read and processed locally in this browser. It is not uploaded to a Praxilume server, and your original file is left unchanged.</span></div>
        <div class="modal-actions">
          <span class="status" id="status" role="status" aria-live="polite">Ready when you are.</span>
          <div class="status-actions">
            <button class="secondary-button" id="cancelTool" type="button">Cancel</button>
            <button class="primary-button" id="runTool" type="button" disabled>${tool.action}</button>
          </div>
        </div>
      </div>
    </section>
  `;
  document.body.append(modal);
  bindModal(tool);
  document.querySelector<HTMLButtonElement>("#closeModal")?.focus();
}

function settingsFor(id: ToolId): string {
  if (id === "split") {
    return `
      <div class="settings">
        <div class="field">
          <label for="pagesPerFile">Pages per file</label>
          <input id="pagesPerFile" type="number" min="1" max="500" value="1" />
          <small>For example, 2 creates one PDF for every two pages.</small>
        </div>
        <div class="field">
          <label for="outputName">Output name</label>
          <input id="outputName" type="text" value="split-document" maxlength="70" />
          <small>All parts will be packaged in one ZIP file.</small>
        </div>
      </div>`;
  }
  if (id === "extract") {
    return `
      <div class="settings">
        <div class="field full">
          <label for="pageRanges">Pages to extract</label>
          <input id="pageRanges" type="text" placeholder="e.g. 1, 3, 5-8 (leave blank for all pages)" />
          <small>Page numbers start at 1. You can combine single pages and ranges.</small>
        </div>
        <div class="field full">
          <label for="outputName">Output name</label>
          <input id="outputName" type="text" value="extracted-pages" maxlength="70" />
        </div>
      </div>`;
  }
  if (id === "pdf-to-images") {
    return `
      <div class="settings">
        <div class="field">
          <label for="pageRanges">Pages (optional)</label>
          <input id="pageRanges" type="text" placeholder="All pages, or e.g. 1, 3-5" />
        </div>
        <div class="field">
          <label for="imageScale">Image quality</label>
          <input id="imageScale" type="number" min="0.5" max="3" step="0.25" value="1.5" />
          <small>Higher values create larger images.</small>
        </div>
      </div>`;
  }
  if (id === "merge") {
    return `
      <div class="settings">
        <div class="field full">
          <label for="outputName">Output name</label>
          <input id="outputName" type="text" value="merged-document" maxlength="70" />
          <small>PDFs are merged in the order listed above.</small>
        </div>
      </div>`;
  }
  if (id === "organize") {
    return '<p class="drop-hint" style="margin:14px 0 0">Use the arrows to change page order, the rotate button to turn a page clockwise, and × to remove it.</p>';
  }
  if (id === "images-to-pdf") {
    return `
      <div class="settings">
        <div class="field full">
          <label for="outputName">Output name</label>
          <input id="outputName" type="text" value="images" maxlength="70" />
          <small>Each image becomes one page. Page size follows the image proportions.</small>
        </div>
      </div>`;
  }
  if (id === "word-to-pdf") {
    return `
      <div class="conversion-note">
        <strong>DOCX files only</strong>
        <span>Converts headings, paragraphs, lists, tables, and embedded images where supported. Complex Word layouts may differ. The generated PDF is image-based, so its text is not selectable or searchable.</span>
      </div>`;
  }
  if (id === "pdf-to-word") {
    return `
      <div class="conversion-note">
        <strong>Editable text extraction</strong>
        <span>Creates a reflowable Word document from selectable PDF text. Original columns, graphics, tables, and exact page layout are not reconstructed. Scanned PDFs need OCR and are not supported by this converter yet.</span>
      </div>`;
  }
  return "";
}

function bindModal(tool: Tool): void {
  const modal = document.querySelector<HTMLDivElement>("#toolModal");
  const fileInput = document.querySelector<HTMLInputElement>("#fileInput");
  const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
  const runButton = document.querySelector<HTMLButtonElement>("#runTool");
  if (!modal || !fileInput || !dropzone || !runButton) return;

  const close = () => {
    if (viewerLoadingTask) void viewerLoadingTask.destroy();
    viewerLoadingTask = null;
    viewerDocument = null;
    modal.remove();
  };
  document.querySelector<HTMLButtonElement>("#closeModal")?.addEventListener("click", close);
  document.querySelector<HTMLButtonElement>("#cancelTool")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.querySelector<HTMLButtonElement>("#pickFiles")?.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const incoming = Array.from(fileInput.files ?? []);
    acceptFiles(tool, incoming);
    fileInput.value = "";
  });

  for (const eventName of ["dragenter", "dragover"] as const) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragover");
    });
  }
  for (const eventName of ["dragleave", "drop"] as const) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragover");
    });
  }
  dropzone.addEventListener("drop", (event) => {
    const transfer = event as DragEvent;
    acceptFiles(tool, Array.from(transfer.dataTransfer?.files ?? []));
  });

  document.querySelector<HTMLDivElement>("#selectedFiles")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const moveButton = target.closest<HTMLButtonElement>("[data-move-file]");
    if (moveButton) {
      const index = Number(moveButton.dataset.moveFile);
      const next = moveButton.dataset.direction === "up" ? index - 1 : index + 1;
      if (index >= 0 && next >= 0 && next < selectedFiles.length) {
        [selectedFiles[index], selectedFiles[next]] = [selectedFiles[next], selectedFiles[index]];
        updateSelectedFiles(tool);
      }
      return;
    }
    const removeButton = target.closest<HTMLButtonElement>("[data-remove-file]");
    if (!removeButton) return;
    selectedFiles.splice(Number(removeButton.dataset.removeFile), 1);
    updateSelectedFiles(tool);
  });

  if (tool.id === "organize") {
    document.querySelector<HTMLDivElement>("#pageList")?.addEventListener("click", handlePageListClick);
    document.querySelector<HTMLButtonElement>("#resetPages")?.addEventListener("click", () => {
      if (!selectedFiles[0]) return;
      loadOrganizePages(selectedFiles[0], true).catch(showError);
    });
  }

  if (tool.id === "viewer") {
    document.querySelector<HTMLButtonElement>("#prevPage")?.addEventListener("click", () => moveViewerPage(-1));
    document.querySelector<HTMLButtonElement>("#nextPage")?.addEventListener("click", () => moveViewerPage(1));
  }

  runButton.addEventListener("click", () => {
    runTool(tool).catch(showError);
  });
}

function acceptFiles(tool: Tool, incoming: File[]): void {
  if (!incoming.length) return;
  const supported = incoming.filter((file) => {
    if (tool.id === "images-to-pdf") {
      return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    }
    if (tool.id === "word-to-pdf") {
      return file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name);
    }
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  });

  if (supported.length !== incoming.length) {
    const expected = tool.id === "images-to-pdf"
      ? "JPG/PNG images"
      : tool.id === "word-to-pdf" ? ".docx Word documents" : "PDF files";
    setStatus("Some files were skipped: this tool accepts " + expected + ".", "error");
  }
  if (!supported.length) return;

  if (tool.multiple) {
    const existing = new Set(selectedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of supported) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!existing.has(key)) {
        selectedFiles.push(file);
        existing.add(key);
      }
    }
  } else {
    selectedFiles = [supported[0]];
    pageOrder = [];
    rotations = new Map();
  }
  updateSelectedFiles(tool);
}

function updateSelectedFiles(tool: Tool): void {
  const list = document.querySelector<HTMLDivElement>("#selectedFiles");
  if (list) {
    list.innerHTML = selectedFiles.map((file, index) => `
      <div class="file-row">
        <div class="file-meta">
          <div class="file-name">${escapeHtml(file.name)}</div>
          <div class="file-size">${formatBytes(file.size)}</div>
        </div>
        <div class="page-actions">
          ${tool.multiple ? `<button type="button" data-move-file="${index}" data-direction="up" aria-label="Move file up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move-file="${index}" data-direction="down" aria-label="Move file down" ${index === selectedFiles.length - 1 ? "disabled" : ""}>↓</button>` : ""}
          <button class="remove-file" type="button" data-remove-file="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button>
        </div>
      </div>
    `).join("");
  }

  const runButton = document.querySelector<HTMLButtonElement>("#runTool");
  if (runButton) {
    runButton.disabled = busy || selectedFiles.length === 0 || (tool.id === "merge" && selectedFiles.length < 2) || (tool.id === "organize" && pageOrder.length === 0);
  }
  if (tool.id === "organize" && selectedFiles[0]) {
    if (runButton) runButton.disabled = true;
    loadOrganizePages(selectedFiles[0]).catch(showError);
  }
  if (tool.id === "organize" && !selectedFiles.length) {
    pageOrder = [];
    rotations.clear();
    renderPageList();
  }
  if (!selectedFiles.length) setStatus("Ready when you are.");
  else setStatus(`${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected.`);
}

async function readPdf(file: File): Promise<Uint8Array> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`${file.name} is larger than the 100 MB limit for this first release.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!header.includes("%PDF-")) {
    throw new Error(`${file.name} does not appear to be a valid PDF file.`);
  }
  return bytes;
}

async function loadPdfDocument(file: File): Promise<PDFDocument> {
  const bytes = await readPdf(file);
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown PDF parsing error";
    throw new Error(`Could not open ${file.name}. It may be damaged or password-protected. (${message})`);
  }
}

function setStatus(message: string, kind: "" | "error" | "success" = ""): void {
  const status = document.querySelector<HTMLSpanElement>("#status");
  if (!status) return;
  status.textContent = message;
  status.className = `status ${kind}`;
}

function setBusy(value: boolean, message?: string): void {
  busy = value;
  const button = document.querySelector<HTMLButtonElement>("#runTool");
  if (button) {
    button.disabled = value || selectedFiles.length === 0 || (activeTool?.id === "merge" && selectedFiles.length < 2) || (activeTool?.id === "organize" && pageOrder.length === 0);
    button.textContent = value ? "Working…" : activeTool?.action ?? "Run";
  }
  if (message) setStatus(message);
}

function getOutputName(fallback: string): string {
  const input = document.querySelector<HTMLInputElement>("#outputName");
  return safePdfName(input?.value || fallback);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function savePdf(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  saveBlob(new Blob([copy.buffer], { type: "application/pdf" }), filename);
}

async function runTool(tool: Tool): Promise<void> {
  if (!selectedFiles.length || busy) return;
  setBusy(true, "Processing locally…");

  try {
    if (tool.id === "merge") await mergePdfs();
    else if (tool.id === "split") await splitPdf();
    else if (tool.id === "extract") await extractPages();
    else if (tool.id === "organize") await organizePdf();
    else if (tool.id === "images-to-pdf") await imagesToPdf();
    else if (tool.id === "pdf-to-images") await pdfToImages();
    else if (tool.id === "word-to-pdf") await wordToPdf();
    else if (tool.id === "pdf-to-word") await pdfToWord();
    else if (tool.id === "viewer") await openViewer();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function mergePdfs(): Promise<void> {
  if (selectedFiles.length < 2) throw new Error("Choose at least two PDF files to merge.");
  const output = await PDFDocument.create();
  for (const file of selectedFiles) {
    setStatus(`Adding ${file.name}…`);
    const source = await loadPdfDocument(file);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  if (!output.getPageCount()) throw new Error("No pages were found in the selected PDFs.");
  const bytes = await output.save();
  savePdf(bytes, `${getOutputName("merged-document")}.pdf`);
  setStatus(`Merged ${output.getPageCount()} pages into one PDF.`, "success");
}

async function splitPdf(): Promise<void> {
  const source = await loadPdfDocument(selectedFiles[0]);
  const total = source.getPageCount();
  const pagesPerFile = Number(document.querySelector<HTMLInputElement>("#pagesPerFile")?.value ?? "1");
  if (!Number.isInteger(pagesPerFile) || pagesPerFile < 1 || pagesPerFile > 500) {
    throw new Error("Pages per file must be a whole number between 1 and 500.");
  }

  const zip = new JSZip();
  const base = getOutputName(safePdfName(selectedFiles[0].name));
  let part = 0;
  for (let start = 0; start < total; start += pagesPerFile) {
    part += 1;
    const indexes = Array.from({ length: Math.min(pagesPerFile, total - start) }, (_, offset) => start + offset);
    const chunk = await PDFDocument.create();
    const pages = await chunk.copyPages(source, indexes);
    pages.forEach((page) => chunk.addPage(page));
    zip.file(`${base}-part-${String(part).padStart(2, "0")}.pdf`, await chunk.save());
    setStatus(`Preparing part ${part}…`);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, `${base}-parts.zip`);
  setStatus(`Created ${part} PDF files in a ZIP archive.`, "success");
}

async function extractPages(): Promise<void> {
  const source = await loadPdfDocument(selectedFiles[0]);
  const ranges = document.querySelector<HTMLInputElement>("#pageRanges")?.value ?? "";
  const requested = parsePageRanges(ranges, source.getPageCount());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, requested.map((page) => page - 1));
  pages.forEach((page) => output.addPage(page));
  savePdf(await output.save(), `${getOutputName("extracted-pages")}.pdf`);
  setStatus(`Created a PDF with ${pages.length} selected pages.`, "success");
}

async function loadOrganizePages(file: File, reset = false): Promise<void> {
  if (!selectedFiles[0] || selectedFiles[0] !== file) return;
  if (pageOrder.length && !reset) return;
  const doc = await loadPdfDocument(file);
  if (doc.getPageCount() > 500) {
    throw new Error("Organize Pages is limited to 500 pages in this first release.");
  }
  pageOrder = doc.getPageIndices();
  rotations = new Map();
  renderPageList();
  setStatus(`${pageOrder.length} pages ready to organize.`);
  const runButton = document.querySelector<HTMLButtonElement>("#runTool");
  if (runButton) runButton.disabled = busy || pageOrder.length === 0;
}

function renderPageList(): void {
  const list = document.querySelector<HTMLDivElement>("#pageList");
  if (!list) return;
  if (!pageOrder.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = pageOrder.map((originalIndex, displayIndex) => {
    const rotated = rotations.get(originalIndex) ?? 0;
    return `
      <div class="page-row">
        <span class="page-label">Page ${originalIndex + 1}${rotated ? ` · rotated ${rotated}°` : ""}</span>
        <div class="page-actions">
          <button type="button" data-page-action="up" data-index="${displayIndex}" aria-label="Move page up" title="Move up" ${displayIndex === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-page-action="down" data-index="${displayIndex}" aria-label="Move page down" title="Move down" ${displayIndex === pageOrder.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-page-action="rotate" data-index="${displayIndex}" aria-label="Rotate page" title="Rotate 90 degrees">↻</button>
          <button type="button" class="is-on" data-page-action="remove" data-index="${displayIndex}" aria-label="Remove page" title="Remove page">×</button>
        </div>
      </div>`;
  }).join("");
}

function handlePageListClick(event: Event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-page-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const action = button.dataset.pageAction;
  if (!Number.isInteger(index) || index < 0 || index >= pageOrder.length) return;
  if (action === "up" && index > 0) {
    [pageOrder[index - 1], pageOrder[index]] = [pageOrder[index], pageOrder[index - 1]];
  } else if (action === "down" && index < pageOrder.length - 1) {
    [pageOrder[index + 1], pageOrder[index]] = [pageOrder[index], pageOrder[index + 1]];
  } else if (action === "rotate") {
    rotations.set(pageOrder[index], ((rotations.get(pageOrder[index]) ?? 0) + 90) % 360);
  } else if (action === "remove") {
    pageOrder.splice(index, 1);
  }
  renderPageList();
  const runButton = document.querySelector<HTMLButtonElement>("#runTool");
  if (runButton) runButton.disabled = busy || pageOrder.length === 0;
  setStatus(`${pageOrder.length} pages will be saved in this order.`);
}

async function organizePdf(): Promise<void> {
  const original = await loadPdfDocument(selectedFiles[0]);
  if (!pageOrder.length) throw new Error("At least one page must remain in the document.");
  const output = await PDFDocument.create();
  const pages = await output.copyPages(original, pageOrder);
  pages.forEach((page, index) => {
    const originalIndex = pageOrder[index];
    const extraRotation = rotations.get(originalIndex) ?? 0;
    if (extraRotation) page.setRotation(degrees((page.getRotation().angle + extraRotation) % 360));
    output.addPage(page);
  });
  savePdf(await output.save(), `${safePdfName(selectedFiles[0].name)}-organized.pdf`);
  setStatus(`Saved ${pages.length} pages. Your original file was not changed.`, "success");
}

async function imagesToPdf(): Promise<void> {
  const output = await PDFDocument.create();
  for (const file of selectedFiles) {
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is over the 25 MB per-image limit.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const image = isPng ? await output.embedPng(bytes) : await output.embedJpg(bytes);
    const scale = Math.min(0.75, 14400 / Math.max(image.width, image.height));
    const width = image.width * scale;
    const height = image.height * scale;
    const page = output.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  savePdf(await output.save(), `${getOutputName("images")}.pdf`);
  setStatus(`Created a PDF with ${selectedFiles.length} image pages.`, "success");
}

async function wordToPdf(): Promise<void> {
  const file = selectedFiles[0];
  if (file.size > MAX_DOCX_BYTES) {
    throw new Error("Word to PDF is limited to 20 MB per .docx file in this browser release.");
  }

  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error("This file is not a valid .docx document. Older .doc files are not supported.");
  }

  setStatus("Reading Word document locally…");
  const converted = await mammoth.convertToHtml({ arrayBuffer: bytes });
  const safeHtml = DOMPurify.sanitize(converted.value, {
    ALLOWED_TAGS: [
      "p", "h1", "h2", "h3", "h4", "h5", "h6", "ol", "ul", "li",
      "table", "thead", "tbody", "tr", "th", "td", "blockquote",
      "pre", "code", "strong", "b", "em", "i", "u", "s", "sup",
      "sub", "span", "a", "img", "br", "hr"
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "colspan", "rowspan", "start"],
    ALLOW_DATA_ATTR: false
  });

  if (!safeHtml.trim()) {
    throw new Error("No readable document content was found in this .docx file.");
  }

  const renderRoot = document.createElement("div");
  renderRoot.className = "word-pdf-render";
  renderRoot.innerHTML = safeHtml;
  renderRoot.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const source = image.getAttribute("src") ?? "";
    if (!source.startsWith("data:image/")) image.remove();
  });
  document.body.append(renderRoot);

  try {
    await Promise.all(Array.from(renderRoot.querySelectorAll("img")).map((image) =>
      image.decode().catch(() => undefined)
    ));
    setStatus("Rendering document pages locally…");
    const pdfBlob = await html2pdf()
      .set({
        margin: [12, 14, 12, 14],
        image: { type: "jpeg", quality: 0.94 },
        html2canvas: {
          scale: 1.4,
          useCORS: false,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        enableLinks: false
      })
      .from(renderRoot)
      .outputPdf("blob");

    if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
      throw new Error("The browser could not create a PDF from this Word document.");
    }
    const base = safePdfName(file.name.replace(/\.docx$/i, ""));
    saveBlob(pdfBlob, base + ".pdf");
    const warnings = converted.messages.filter((message) => message.type === "warning").length;
    setStatus(
      warnings
        ? "Created PDF. " + warnings + " unsupported or simplified Word element(s) were reported."
        : "Created a PDF from the Word document. Review the result for layout differences.",
      "success"
    );
  } finally {
    renderRoot.remove();
  }
}

async function pdfToWord(): Promise<void> {
  const bytes = await readPdf(selectedFiles[0]);
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > MAX_WORD_EXPORT_PAGES) {
      throw new Error("PDF to Word is limited to " + MAX_WORD_EXPORT_PAGES + " pages per conversion.");
    }

    const paragraphs: Paragraph[] = [];
    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setStatus("Extracting text from page " + pageNumber + " of " + pdf.numPages + "…");
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => "str" in item && typeof item.str === "string")
        .map((item) => {
          const textItem = item as {
            str: string;
            transform: number[];
            width?: number;
            hasEOL?: boolean;
          };
          return {
            str: textItem.str,
            x: textItem.transform[4] ?? 0,
            y: textItem.transform[5] ?? 0,
            width: textItem.width ?? 0,
            hasEOL: textItem.hasEOL ?? false
          };
        });
      const lines = extractPdfTextLines(items);
      for (const line of lines) {
        extractedCharacters += line.length;
        paragraphs.push(new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 90 }
        }));
      }
      if (pageNumber % 5 === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    if (!paragraphs.length || extractedCharacters === 0) {
      throw new Error("No selectable text was found. This may be a scanned/image-only PDF; OCR is not available in this version.");
    }

    setStatus("Building editable Word document…");
    const base = safePdfName(selectedFiles[0].name.replace(/\.pdf$/i, ""));
    const wordDocument = new Document({
      creator: "Praxilume PDF",
      title: base,
      description: "Editable text extracted locally from a PDF by Praxilume PDF.",
      sections: [{
        properties: {
          page: {
            margin: { top: 900, right: 900, bottom: 900, left: 900 }
          }
        },
        children: paragraphs
      }]
    });
    const blob = await Packer.toBlob(wordDocument);
    saveBlob(blob, base + ".docx");
    setStatus(
      "Created an editable Word document from " + paragraphs.length + " extracted text lines. Layout and graphics were not reconstructed.",
      "success"
    );
  } finally {
    await loadingTask.destroy();
  }
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not export this page as an image."));
    }, "image/png");
  });
}

async function renderPdfPage(
  documentProxy: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  canvas: HTMLCanvasElement
): Promise<void> {
  const page = await documentProxy.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
}

async function pdfToImages(): Promise<void> {
  const bytes = await readPdf(selectedFiles[0]);
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const ranges = document.querySelector<HTMLInputElement>("#pageRanges")?.value ?? "";
  const requested = parsePageRanges(ranges, pdf.numPages);
  if (requested.length > 100) {
    throw new Error("Export is limited to 100 pages at a time. Select a smaller page range.");
  }
  const scale = Number(document.querySelector<HTMLInputElement>("#imageScale")?.value ?? "1.5");
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 3) {
    throw new Error("Image quality must be between 0.5 and 3.");
  }

  const zip = new JSZip();
  const base = safePdfName(selectedFiles[0].name);
  const canvas = document.createElement("canvas");
  for (const [index, pageNumber] of requested.entries()) {
    setStatus(`Rendering page ${pageNumber} of ${pdf.numPages}…`);
    await renderPdfPage(pdf, pageNumber, scale, canvas);
    zip.file(`${base}-page-${String(pageNumber).padStart(3, "0")}.png`, await canvasToPng(canvas));
    if (index % 5 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  canvas.width = 0;
  canvas.height = 0;
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, `${base}-images.zip`);
  await loadingTask.destroy();
  setStatus(`Exported ${requested.length} page images.`, "success");
}

async function openViewer(): Promise<void> {
  const bytes = await readPdf(selectedFiles[0]);
  if (viewerLoadingTask) await viewerLoadingTask.destroy();
  viewerLoadingTask = pdfjsLib.getDocument({ data: bytes });
  viewerDocument = await viewerLoadingTask.promise;
  viewerPageNumber = 1;
  const stage = document.querySelector<HTMLDivElement>("#viewerStage");
  if (stage) stage.innerHTML = '<canvas id="viewerCanvas" aria-label="PDF page preview"></canvas>';
  await renderViewerPage();
  const prev = document.querySelector<HTMLButtonElement>("#prevPage");
  const next = document.querySelector<HTMLButtonElement>("#nextPage");
  if (prev) prev.disabled = true;
  if (next) next.disabled = viewerDocument.numPages <= 1;
  setStatus(`Opened ${viewerDocument.numPages} pages in the browser preview.`, "success");
}

async function renderViewerPage(): Promise<void> {
  if (!viewerDocument) return;
  const canvas = document.querySelector<HTMLCanvasElement>("#viewerCanvas");
  if (!canvas) return;
  const page = await viewerDocument.getPage(viewerPageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const stage = document.querySelector<HTMLDivElement>("#viewerStage");
  const maxWidth = Math.max(260, Math.min((stage?.clientWidth ?? 600) - 28, 620));
  const scale = Math.min(1.5, maxWidth / unscaled.width);
  await renderPdfPage(viewerDocument, viewerPageNumber, scale, canvas);
  const label = document.querySelector<HTMLSpanElement>("#viewerPageLabel");
  if (label) label.textContent = `Page ${viewerPageNumber} of ${viewerDocument.numPages}`;
  const prev = document.querySelector<HTMLButtonElement>("#prevPage");
  const next = document.querySelector<HTMLButtonElement>("#nextPage");
  if (prev) prev.disabled = viewerPageNumber <= 1;
  if (next) next.disabled = viewerPageNumber >= viewerDocument.numPages;
}

function moveViewerPage(delta: number): void {
  if (!viewerDocument) return;
  const next = viewerPageNumber + delta;
  if (next < 1 || next > viewerDocument.numPages) return;
  viewerPageNumber = next;
  renderViewerPage().catch(showError);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Something went wrong while processing this file.";
  setStatus(message, "error");
}

function showInfo(title: string, message: string): void {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
      <header class="modal-head">
        <div><p class="modal-kicker">Praxilume PDF</p><h2 id="infoTitle">${escapeHtml(title)}</h2></div>
        <button class="icon-button" type="button" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <p class="modal-subtitle" style="font-size:12px;line-height:1.7">${escapeHtml(message)}</p>
        <div class="modal-actions"><span></span><button class="primary-button" type="button">Close</button></div>
      </div>
    </section>`;
  document.body.append(modal);
  modal.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => modal.remove()));
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
}

function showPrivacy(): void {
  showInfo(
    "Your files stay on your device",
    "This first release processes selected PDFs and images inside your browser. It has no document-upload API, user account, or cloud-processing backend. Your files are read into browser memory only when you choose a tool. The app does not intentionally transmit document contents. Avoid using shared or untrusted devices for sensitive documents, and always verify important outputs before relying on them."
  );
}

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector<HTMLInputElement>("#toolSearch")?.focus();
  }
  if (event.key === "Escape") {
    document.querySelector("#toolModal")?.remove();
  }
});

renderApp();
