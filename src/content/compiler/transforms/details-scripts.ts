import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

export interface ScriptTransformContext {
  scriptCount: number;
}

export function rehypeDetailsScripts(context?: ScriptTransformContext) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      // Check for script blocks (e.g. data-script-id or class="script-block")
      if (
        node.properties &&
        (node.properties.dataScriptId ||
          (Array.isArray(node.properties.className) &&
            node.properties.className.includes("script-block")))
      ) {
        if (context) {
          context.scriptCount++;
        }
      }
    });
  };
}
