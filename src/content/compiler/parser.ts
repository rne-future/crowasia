import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Root as MdastRoot } from "mdast";

import { remarkAlerts, type AlertTransformContext } from "./transforms/alerts";
import {
  remarkChecklist,
  type ChecklistTransformContext,
} from "./transforms/checklist";
import { remarkPlaceholders } from "./transforms/placeholders";
import { remarkFootnotes, type FootnoteContext } from "./footnotes";
import {
  rehypeMermaid,
  type MermaidTransformContext,
} from "./transforms/mermaid";
import {
  rehypeDetailsScripts,
  type ScriptTransformContext,
} from "./transforms/details-scripts";
import { rehypeToc, type TocContext } from "./toc";
import { HTML_SANITIZE_SCHEMA } from "./sanitize";
import type { CompilerConfig } from "./types";

export interface PipelineContext
  extends AlertTransformContext,
    ChecklistTransformContext,
    FootnoteContext,
    MermaidTransformContext,
    ScriptTransformContext,
    TocContext {
  title?: string;
}

export function parseMarkdownToMdast(source: string): MdastRoot {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(source);
}

export function createCompilerPipeline(
  config: CompilerConfig,
  context: PipelineContext
) {
  context.mermaidRenderer = config.mermaidRenderer;

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkAlerts, context)
    .use(remarkChecklist, context)
    .use(remarkPlaceholders)
    .use(remarkFootnotes, context)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeDetailsScripts, context)
    .use(rehypeMermaid, context)
    .use(rehypeToc, context)
    .use(rehypeSanitize, HTML_SANITIZE_SCHEMA)
    .use(rehypeStringify);
}
