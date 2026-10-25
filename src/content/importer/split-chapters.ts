import type { ChapterSplit, BookMetadata } from "./types";

const CH0_REGEX = /^##\s+(?:Pendahuluan|Introduction)(?::|\s|$)/i;
const CHN_REGEX = /^##\s+(?:Bab|Chapter)\s+(\d+)(?::|\s|$)/i;
const CH14_REGEX = /^##\s+(?:Lampiran|Appendix)(?::|\s|$)/i;
const TOC_REGEX = /^##\s+(?:Daftar\s+Isi|Table\s+of\s+Contents)(?::|\s|$)/i;

interface HeadingMatch {
  index: number;
  slug: string;
  title: string;
  startLine: number;
}

export function extractBookMetadata(source: string): BookMetadata {
  const rawLines = source.split(/\r?\n/);
  const lines =
    rawLines.length > 0 && rawLines[rawLines.length - 1] === ""
      ? rawLines.slice(0, -1)
      : rawLines;
  let tocStartLine = -1;
  let ch0StartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (tocStartLine === -1 && TOC_REGEX.test(line)) {
      tocStartLine = i + 1;
    }
    if (ch0StartLine === -1 && CH0_REGEX.test(line)) {
      ch0StartLine = i + 1;
      break;
    }
  }

  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : undefined;

  const authorLine = lines.find((l) => /\*\*(?:Ditulis oleh|Written by):\*\*/i.test(l));
  const authorMatch = authorLine?.match(/`([^`]+)`/);
  const author = authorMatch ? authorMatch[1] : undefined;

  const resolvedTocStart = tocStartLine > 0 ? tocStartLine : 10;
  const resolvedCh0Start = ch0StartLine > 0 ? ch0StartLine : 28;

  return {
    title,
    author,
    frontmatterLines: [1, resolvedTocStart - 1],
    tocLines: [resolvedTocStart, resolvedCh0Start - 1],
  };
}

export function splitBook(source: string, bookId: string): ChapterSplit[] {
  const rawLines = source.split(/\r?\n/);
  // If the file ends with a trailing newline, pop the empty trailing item so line counts match 1-based indexing
  const lines =
    rawLines.length > 0 && rawLines[rawLines.length - 1] === ""
      ? rawLines.slice(0, -1)
      : rawLines;
  const detected: HeadingMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("## ")) {
      continue;
    }

    if (CH0_REGEX.test(line)) {
      detected.push({
        index: 0,
        slug: "ch-0",
        title: line.replace(/^##\s+/, "").trim(),
        startLine: i + 1,
      });
      continue;
    }

    const nMatch = line.match(CHN_REGEX);
    if (nMatch) {
      const idx = parseInt(nMatch[1], 10);
      if (idx >= 1 && idx <= 13) {
        detected.push({
          index: idx,
          slug: `ch-${idx}`,
          title: line.replace(/^##\s+/, "").trim(),
          startLine: i + 1,
        });
        continue;
      }
    }

    if (CH14_REGEX.test(line)) {
      detected.push({
        index: 14,
        slug: "ch-14",
        title: line.replace(/^##\s+/, "").trim(),
        startLine: i + 1,
      });
      continue;
    }
  }

  if (detected.length !== 15) {
    throw new Error(
      `Expected 15 chapters (ch-0..ch-14) for ${bookId}, but found ${detected.length}`
    );
  }

  // Ensure sequential indices
  detected.sort((a, b) => a.index - b.index);
  for (let i = 0; i < 15; i++) {
    if (detected[i].index !== i) {
      throw new Error(
        `Expected chapter index ${i} for ${bookId}, but found ${detected[i].index} (${detected[i].slug})`
      );
    }
  }

  const chapters: ChapterSplit[] = [];

  for (let i = 0; i < 15; i++) {
    const cur = detected[i];
    const endLine = i < 14 ? detected[i + 1].startLine - 1 : lines.length;
    const chapterSource = lines.slice(cur.startLine - 1, endLine).join("\n");
    const isFreeSample = cur.index === 0 || cur.index === 1;

    chapters.push({
      slug: cur.slug,
      index: cur.index,
      title: cur.title,
      source: chapterSource,
      startLine: cur.startLine,
      endLine,
      isFreeSample,
    });
  }

  return chapters;
}
