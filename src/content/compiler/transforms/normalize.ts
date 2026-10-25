export interface NormalizeResult {
  text: string;
  warnings: string[];
}

export function normalizeSource(source: string): NormalizeResult {
  const warnings: string[] = [];

  // Normalize line endings to standard LF
  let normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Check for legacy </br> tag
  if (/<\/br>/i.test(normalized)) {
    warnings.push("Replaced legacy </br> with <br>");
    normalized = normalized.replace(/<\/br>/gi, "<br>");
  }

  // Ensure isolated HTML elements and markdown block constructs have proper blank lines
  // so CommonMark does not collapse subsequent markdown blocks into unparsed raw HTML blocks
  normalized = normalized
    .replace(
      /(<\/[a-z0-9_-]+>|<[a-z0-9_-]+[^>]*\/>|<img[^>]*>)\n(?=[>#\[<])/gi,
      "$1\n\n"
    )
    .replace(/(\[[^\]]+\]\([^)]+\))\n(?=[<#])/gi, "$1\n\n");

  return { text: normalized, warnings };
}
