import { createHash } from "node:crypto";
import { normalizeSource } from "./transforms/normalize";
import { createCompilerPipeline, type PipelineContext } from "./parser";
import { defaultConfig, type CompilerConfig, type CompileResult, type ChapterMetadata } from "./types";

export * from "./types";
export * from "./parser";
export * from "./sanitize";
export * from "./toc";
export * from "./footnotes";
export * from "./transforms/normalize";
export * from "./transforms/alerts";
export * from "./transforms/checklist";
export * from "./transforms/mermaid";
export * from "./transforms/placeholders";
export * from "./transforms/details-scripts";

export function compileChapter(
  source: string,
  config: Partial<CompilerConfig> = defaultConfig
): CompileResult {
  const resolvedConfig: CompilerConfig = {
    ...defaultConfig,
    ...config,
  };

  // 1. Normalize line endings and legacy tags
  const { text: normalizedSource, warnings } = normalizeSource(source);

  // 2. Prepare pipeline context
  const context: PipelineContext = {
    alertsCount: 0,
    tasksCount: 0,
    diagramsCount: 0,
    footnotesCount: 0,
    scriptCount: 0,
    headingsCount: 0,
    toc: [],
  };

  // 3. Run unified compilation pipeline
  const pipeline = createCompilerPipeline(resolvedConfig, context);
  const vfile = pipeline.processSync(normalizedSource);
  const html = String(vfile);

  // 4. Extract chapter title from h1 if present
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
    : undefined;

  // 5. Generate plain search text (strip HTML tags and normalize spaces)
  const searchText = html
    .replace(
      /<\/(p|div|h[1-6]|li|blockquote|aside|tr|td|th|section|details|summary)>/gi,
      " "
    )
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // 6. Generate preview text with length limitation
  const previewLimit = resolvedConfig.previewLengthLimit ?? 300;
  const previewText =
    searchText.length > previewLimit
      ? searchText.slice(0, previewLimit).trim()
      : searchText;

  // 7. Deterministic hashing: SHA256 of source and manifest
  const sourceHash = createHash("sha256")
    .update(source, "utf-8")
    .digest("hex");

  const manifestSeed =
    resolvedConfig.manifestHash ||
    `${resolvedConfig.compilerVersion}:${resolvedConfig.sanitizerVersion}`;
  const manifestHash = resolvedConfig.manifestHash
    ? resolvedConfig.manifestHash
    : createHash("sha256").update(manifestSeed, "utf-8").digest("hex");

  const metadata: ChapterMetadata = {
    title,
    headingsCount: context.headingsCount,
    tasksCount: context.tasksCount,
    diagramsCount: context.diagramsCount,
    footnotesCount: context.footnotesCount,
    alertsCount: context.alertsCount,
    scriptCount: context.scriptCount,
  };

  return {
    html,
    toc: context.toc,
    searchText,
    previewText,
    metadata,
    sourceHash,
    manifestHash,
    warnings,
  };
}
