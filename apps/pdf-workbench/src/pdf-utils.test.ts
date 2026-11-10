import { describe, expect, it } from "vitest";
import { formatBytes, parsePageRanges, safePdfName } from "./pdf-utils";

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
