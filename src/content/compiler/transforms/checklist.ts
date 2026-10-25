import { visit } from "unist-util-visit";
import type { Root, List, ListItem, Paragraph, Text } from "mdast";

export interface ChecklistTransformContext {
  tasksCount: number;
}

export function remarkChecklist(context?: ChecklistTransformContext) {
  return (tree: Root) => {
    let ordinal = 0;
    visit(tree, "list", (listNode: List) => {
      let isChecklist = false;

      for (const item of listNode.children as ListItem[]) {
        if (item.checked !== null && item.checked !== undefined) {
          isChecklist = true;
          ordinal++;

          item.data = {
            ...item.data,
            hName: "li",
            hProperties: {
              className: ["checklist-item"],
              dataOrdinal: String(ordinal),
              dataChecked: item.checked ? "true" : "false",
            },
          };

          // Remove item.checked so mdast-util-to-hast doesn't insert disabled <input>
          delete (item as { checked?: boolean | null }).checked;

          // Clean up leading whitespace if remark-gfm left one
          if (item.children && item.children.length > 0) {
            const firstChild = item.children[0];
            if (firstChild.type === "paragraph" && firstChild.children.length > 0) {
              const firstText = firstChild.children[0] as Text;
              if (firstText.type === "text" && firstText.value.startsWith(" ")) {
                firstText.value = firstText.value.trimStart();
              }
            }
          }
        }
      }

      if (isChecklist) {
        listNode.data = {
          ...listNode.data,
          hName: "ul",
          hProperties: {
            className: ["checklist"],
          },
        };
      }
    });

    if (context) {
      context.tasksCount = ordinal;
    }
  };
}
