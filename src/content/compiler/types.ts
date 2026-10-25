export interface TocEntry {
  id: string;
  title: string;
  level: number;
}

export interface ChapterMetadata {
  title?: string;
  headingsCount: number;
  tasksCount: number;
  diagramsCount: number;
  footnotesCount: number;
  alertsCount: number;
  scriptCount?: number;
  [key: string]: unknown;
}

export interface CompilerConfig {
  compilerVersion: string;
  sanitizerVersion: string;
  manifestHash?: string;
  previewLengthLimit?: number;
  mermaidRenderer?: (code: string) => Promise<string> | string;
}

export interface CompileResult {
  html: string;
  toc: TocEntry[];
  searchText: string;
  previewText: string;
  metadata: ChapterMetadata;
  sourceHash: string;
  manifestHash: string;
  warnings: string[];
}

export const defaultConfig: CompilerConfig = {
  compilerVersion: "1.0.0",
  sanitizerVersion: "1.0.0",
  previewLengthLimit: 300,
};
