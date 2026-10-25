import { visit } from "unist-util-visit";
import type { Root } from "mdast";

export interface FootnoteContext {
  footnotesCount: number;
}

export function remarkFootnotes(context: FootnoteContext) {
  return (tree: Root) => {
    let count = 0;
    visit(tree, "footnoteDefinition", () => {
      count++;
    });

    // If no definitions found, count references as fallback
    if (count === 0) {
      const refs = new Set<string>();
      visit(tree, "footnoteReference", (node: { identifier?: string }) => {
        if (node.identifier) {
          refs.add(node.identifier);
        }
      });
      count = refs.size;
    }

    context.footnotesCount = count;
  };
}
