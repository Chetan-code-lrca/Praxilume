export const MAX_PDF_BYTES = 100 * 1024 * 1024;

export function parsePageRanges(input: string, totalPages: number): number[] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new Error("The PDF does not contain any pages.");
  }

  const value = input.trim();
  if (!value) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: number[] = [];
  const seen = new Set<number>();

  for (const part of value.split(",")) {
    const token = part.trim();
    if (!token) throw new Error("Page ranges cannot contain empty entries.");

    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) {
      throw new Error(`Invalid page range "${token}". Use values such as 1, 3, 5-8.`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < start || end > totalPages) {
      throw new Error(`"${token}" is outside the available pages (1–${totalPages}).`);
    }

    for (let page = start; page <= end; page += 1) {
      if (!seen.has(page)) {
        pages.push(page);
        seen.add(page);
      }
    }
  }

  return pages;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = units[0];
  for (let index = 0; size >= 1024 && index < units.length - 1; index += 1) {
    size /= 1024;
    unit = units[index + 1];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

export function safePdfName(name: string): string {
  const cleaned = name
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "document";
}
