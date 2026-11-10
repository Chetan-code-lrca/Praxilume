import { expect, test, type Page } from "@playwright/test";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

async function makePdf(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Test page ${index + 1}`, { x: 40, y: 740, size: 18 });
  }
  return Buffer.from(await document.save());
}

async function makeDocx(): Promise<Buffer> {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun("Praxilume Word conversion smoke test")] }),
        new Paragraph({ children: [new TextRun("A second editable paragraph.")] })
      ]
    }]
  });
  return Packer.toBuffer(document);
}

async function selectPdf(
  page: Page,
  tool: "merge" | "extract" | "viewer" | "pdf-to-word",
  files: Array<{ name: string; buffer: Buffer }>
): Promise<void> {
  await page.locator(`[data-tool="${tool}"]`).click();
  const payload = files.map((file) => ({
    name: file.name,
    mimeType: "application/pdf",
    buffer: file.buffer
  }));
  await page.locator("#fileInput").setInputFiles(payload.length === 1 ? payload[0] : payload);
}

test("dashboard uses desktop width, shows nine tools, and supports conversion search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PDF Tools" })).toBeVisible();
  await expect(page.locator(".tool-grid .tool-card")).toHaveCount(9);

  const shell = await page.locator(".app-shell").boundingBox();
  const card = await page.locator(".tool-card").first().boundingBox();
  expect(shell?.width ?? 0).toBeGreaterThan(1100);
  expect(card?.height ?? 0).toBeGreaterThanOrEqual(160);

  await page.locator("#toolSearch").fill("word to pdf");
  await expect(page.locator(".tool-grid .tool-card")).toHaveCount(1);
  await expect(page.locator('[data-tool="word-to-pdf"]')).toBeVisible();
});

test("merge creates a valid PDF and preserves selected file order", async ({ page }) => {
  const outsideRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith("http://127.0.0.1:4173")) {
      outsideRequests.push(url);
    }
  });

  await page.goto("/");
  await selectPdf(page, "merge", [
    { name: "first.pdf", buffer: await makePdf(2) },
    { name: "second.pdf", buffer: await makePdf(1) }
  ]);

  await expect(page.locator("#selectedFiles")).toContainText("first.pdf");
  await expect(page.locator("#selectedFiles")).toContainText("second.pdf");
  await expect(page.locator("#runTool")).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#runTool").click();
  const download = await downloadPromise;
  const destination = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(destination);

  const result = await PDFDocument.load(await readFile(destination));
  expect(result.getPageCount()).toBe(3);
  await expect(page.locator("#status")).toContainText("Merged 3 pages");
  expect(outsideRequests).toEqual([]);
});

test("extract rejects page ranges outside the document", async ({ page }) => {
  await page.goto("/");
  await selectPdf(page, "extract", [
    { name: "three-pages.pdf", buffer: await makePdf(3) }
  ]);

  await page.locator("#pageRanges").fill("1, 5");
  await page.locator("#runTool").click();
  await expect(page.locator("#status")).toContainText("outside the available pages");
});

test("viewer renders the selected PDF in-browser", async ({ page }) => {
  await page.goto("/");
  await selectPdf(page, "viewer", [
    { name: "preview.pdf", buffer: await makePdf(2) }
  ]);

  await page.locator("#runTool").click();
  await expect(page.locator("#viewerCanvas")).toBeVisible();
  await expect(page.locator("#viewerPageLabel")).toContainText("Page 1 of 2");
  await page.locator("#nextPage").click();
  await expect(page.locator("#viewerPageLabel")).toContainText("Page 2 of 2");
});

test("Word to PDF converts a DOCX entirely in the browser", async ({ page }) => {
  const outsideRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith("http://127.0.0.1:4173")) {
      outsideRequests.push(url);
    }
  });

  await page.goto("/");
  await page.locator('[data-tool="word-to-pdf"]').click();
  await page.locator("#fileInput").setInputFiles({
    name: "sample.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await makeDocx()
  });
  await expect(page.locator("#runTool")).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#runTool").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sample.pdf");
  const destination = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(destination);

  const result = await PDFDocument.load(await readFile(destination));
  expect(result.getPageCount()).toBeGreaterThan(0);
  expect(result.getPage(0).getWidth()).toBeGreaterThan(500);
  await expect(page.locator("#status")).toContainText("Created a PDF");
  expect(outsideRequests).toEqual([]);
});

test("PDF to Word creates a valid editable DOCX from selectable PDF text", async ({ page }) => {
  const outsideRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith("http://127.0.0.1:4173")) {
      outsideRequests.push(url);
    }
  });

  await page.goto("/");
  await selectPdf(page, "pdf-to-word", [
    { name: "selectable-text.pdf", buffer: await makePdf(2) }
  ]);
  await expect(page.locator("#runTool")).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#runTool").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("selectable-text.docx");
  const destination = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(destination);

  const archive = await JSZip.loadAsync(await readFile(destination));
  const documentXml = await archive.file("word/document.xml")?.async("string");
  expect(documentXml).toContain("Test page 1");
  expect(documentXml).toContain("Test page 2");
  await expect(page.locator("#status")).toContainText("Created an editable Word document");
  expect(outsideRequests).toEqual([]);
});

test("PDF to Word rejects scanned/image-only PDFs with a clear OCR message", async ({ page }) => {
  const imageOnly = await PDFDocument.create();
  imageOnly.addPage([612, 792]);
  await page.goto("/");
  await selectPdf(page, "pdf-to-word", [
    { name: "blank-scan.pdf", buffer: Buffer.from(await imageOnly.save()) }
  ]);

  await page.locator("#runTool").click();
  await expect(page.locator("#status")).toContainText("No selectable text was found");
});
