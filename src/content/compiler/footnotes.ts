import { visit } from "unist-util-visit";
import type { Root, FootnoteDefinition, List, ListItem } from "mdast";

export interface FootnoteContext {
  footnotesCount: number;
}

export function remarkFootnotes(context: FootnoteContext) {
  return (tree: Root) => {
    const referencedIds = new Set<string>();
    visit(tree, "footnoteReference", (node: { identifier?: string }) => {
      if (node.identifier) {
        referencedIds.add(node.identifier);
      }
    });

    let defCount = 0;
    const unreferencedDefs: FootnoteDefinition[] = [];

    visit(tree, "footnoteDefinition", (node: FootnoteDefinition) => {
      defCount++;
      if (node.identifier && !referencedIds.has(node.identifier)) {
        unreferencedDefs.push(node);
      }
    });

    // If no definitions found, count references as fallback
    let count = defCount;
    if (count === 0) {
      count = referencedIds.size;
    }
    context.footnotesCount = count;

    // Convert unreferenced footnote definitions to rendered list items so content is preserved
    if (unreferencedDefs.length > 0) {
      const listItems: ListItem[] = unreferencedDefs.map((def) => ({
        type: "listItem",
        data: {
          hProperties: {
            id: `fn-${def.identifier}`,
            className: ["footnote-item"],
          },
        },
        children: def.children,
      }));

      const listNode: List = {
        type: "list",
        ordered: true,
        data: {
          hProperties: {
            className: ["footnote-list"],
          },
        },
        children: listItems,
      };

      const firstDef = unreferencedDefs[0];
      const firstIdx = tree.children.indexOf(firstDef);
      if (firstIdx !== -1) {
        const unreferencedSet = new Set(unreferencedDefs);
        tree.children = tree.children.filter(
          (n) => !unreferencedSet.has(n as FootnoteDefinition)
        );
        tree.children.splice(firstIdx, 0, listNode);
      }
    }
  };
}
