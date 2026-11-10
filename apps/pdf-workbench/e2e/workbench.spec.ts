import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Test page ${index + 1}`, { x: 40, y: 740, size: 18 });
  }
  return Buffer.from(await document.save());
}

async function selectPdf(
  page: Page,
  tool: "merge" | "extract" | "viewer",
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

test("dashboard stays compact and tool search works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PDF Tools" })).toBeVisible();
  await expect(page.locator(".tool-grid .tool-card")).toHaveCount(7);

  await page.locator("#toolSearch").fill("merge");
  await expect(page.locator(".tool-grid .tool-card")).toHaveCount(1);
  await expect(page.locator('[data-tool="merge"]')).toBeVisible();
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

  const result = await PDFDocument.load(await import("node:fs/promises").then((fs) => fs.readFile(destination)));
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
