import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { sanitizeSvg } from "../sanitize";

export interface MermaidTransformContext {
  diagramsCount: number;
  mermaidRenderer?: (code: string) => Promise<string> | string;
}

export function rehypeMermaid(context?: MermaidTransformContext) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (
        node.tagName === "pre" &&
        node.children &&
        node.children.length === 1 &&
        parent &&
        typeof index === "number"
      ) {
        const codeEl = node.children[0];
        if (codeEl.type === "element" && codeEl.tagName === "code") {
          const classes = (codeEl.properties?.className as string[]) || [];
          if (classes.includes("language-mermaid")) {
            if (context) {
              context.diagramsCount++;
            }

            // Extract the raw mermaid code
            let codeContent = "";
            if (codeEl.children && codeEl.children.length > 0) {
              codeContent = codeEl.children
                .map((c) => ("value" in c ? c.value : ""))
                .join("");
            }

            // If a renderer is provided, render server-side
            if (context?.mermaidRenderer) {
              try {
                const rendered = context.mermaidRenderer(codeContent);
                if (typeof rendered === "string" && rendered.includes("<svg")) {
                  const sanitized = sanitizeSvg(rendered);
                  const parsed = unified()
                    .use(rehypeParse, { fragment: true, space: "svg" })
                    .parse(sanitized);

                  if (parsed.children && parsed.children.length > 0) {
                    parent.children.splice(
                      index,
                      1,
                      ...(parsed.children as unknown as Element[])
                    );
                    return;
                  }
                }
              } catch {
                // Fall back to pre.mermaid-fallback
              }
            }

            node.properties = {
              ...node.properties,
              className: ["mermaid-fallback"],
            };
          }
        }
      }
    });
  };
}
