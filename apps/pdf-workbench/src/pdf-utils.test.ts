import { describe, expect, it } from "vitest";
import { extractPdfTextLines, formatBytes, parsePageRanges, safePdfName } from "./pdf-utils";

describe("parsePageRanges", () => {
  it("expands and deduplicates page ranges while preserving requested order", () => {
    expect(parsePageRanges("3, 1, 5-7, 6", 8)).toEqual([3, 1, 5, 6, 7]);
  });

  it("selects all pages when the field is empty", () => {
    expect(parsePageRanges("", 3)).toEqual([1, 2, 3]);
  });

  it("rejects invalid and out-of-range page requests", () => {
    expect(() => parsePageRanges("1,4-2", 8)).toThrow();
    expect(() => parsePageRanges("0", 8)).toThrow();
    expect(() => parsePageRanges("1,9", 8)).toThrow();
    expect(() => parsePageRanges("two", 8)).toThrow();
  });
});

describe("formatBytes", () => {
  it("formats bytes and kilobytes", () => {
    expect(formatBytes(800)).toBe("800 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});

describe("safePdfName", () => {
  it("removes extensions and unsafe characters", () => {
    expect(safePdfName("my private report.pdf")).toBe("my-private-report");
    expect(safePdfName("...pdf")).toBe("document");
  });
});


describe("extractPdfTextLines", () => {
  it("groups positioned text items into editable lines", () => {
    expect(extractPdfTextLines([
      { str: "Praxilume", x: 40, y: 740, width: 55 },
      { str: " PDF", x: 98, y: 740, width: 25, hasEOL: true },
      { str: "Second line", x: 40, y: 720, width: 70, hasEOL: true }
    ])).toEqual(["Praxilume PDF", "Second line"]);
  });

  it("inserts a space between adjacent words with a visible gap", () => {
    expect(extractPdfTextLines([
      { str: "Local", x: 10, y: 100, width: 24 },
      { str: "processing", x: 38, y: 100, width: 48, hasEOL: true }
    ])).toEqual(["Local processing"]);
  });

  it("ignores empty text items and empty lines", () => {
    expect(extractPdfTextLines([
      { str: "", x: 0, y: 10, hasEOL: true },
      { str: "Readable", x: 0, y: 0, hasEOL: true }
    ])).toEqual(["Readable"]);
  });
});
