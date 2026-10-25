import { importBook } from "@/content/importer";
import type { ImportOptions } from "@/content/importer/types";

function parseArgs(args: string[]): {
  bookId?: string;
  locale?: string;
  register?: "standard" | "casual";
  sourcePath?: string;
  dryRun?: boolean;
  all?: boolean;
} {
  const result: {
    bookId?: string;
    locale?: string;
    register?: "standard" | "casual";
    sourcePath?: string;
    dryRun?: boolean;
    all?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--all") {
      result.all = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg.startsWith("--dry-run=")) {
      result.dryRun = arg.split("=")[1] !== "false";
    } else if (arg === "--book" || arg === "-b") {
      result.bookId = args[++i];
    } else if (arg.startsWith("--book=")) {
      result.bookId = arg.split("=")[1];
    } else if (arg === "--locale" || arg === "-l") {
      result.locale = args[++i];
    } else if (arg.startsWith("--locale=")) {
      result.locale = arg.split("=")[1];
    } else if (arg === "--register" || arg === "-r") {
      result.register = args[++i] as "standard" | "casual";
    } else if (arg.startsWith("--register=")) {
      result.register = arg.split("=")[1] as "standard" | "casual";
    } else if (arg === "--source" || arg === "-s") {
      result.sourcePath = args[++i];
    } else if (arg.startsWith("--source=")) {
      result.sourcePath = arg.split("=")[1];
    }
  }

  return result;
}

const ALL_VARIANTS: Array<{
  bookId: string;
  locale: string;
  register: "standard" | "casual";
}> = [
  { bookId: "book-1", locale: "id", register: "standard" },
  { bookId: "book-1", locale: "id", register: "casual" },
  { bookId: "book-1", locale: "en", register: "standard" },
  { bookId: "book-2", locale: "id", register: "standard" },
  { bookId: "book-2", locale: "id", register: "casual" },
  { bookId: "book-2", locale: "en", register: "standard" },
  { bookId: "book-3", locale: "id", register: "standard" },
  { bookId: "book-3", locale: "id", register: "casual" },
  { bookId: "book-3", locale: "en", register: "standard" },
];

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  const dryRun = parsed.dryRun ?? false;

  if (parsed.all) {
    console.log(`Starting bulk import for all 9 variants (dryRun: ${dryRun})...\n`);
    let totalChapters = 0;
    let totalChecklistItems = 0;
    let failureCount = 0;

    for (const v of ALL_VARIANTS) {
      console.log(`Importing ${v.bookId} (${v.locale}/${v.register})...`);
      const report = await importBook({
        bookId: v.bookId,
        locale: v.locale,
        register: v.register,
        dryRun,
      });

      if (report.errors.length > 0) {
        console.error(`  FAILED with errors:`, report.errors);
        failureCount++;
      } else {
        console.log(
          `  OK: ${report.chaptersCount} chapters, ${report.checklistItemsCount} checklist items`
        );
        totalChapters += report.chaptersCount;
        totalChecklistItems += report.checklistItemsCount;
      }
    }

    console.log("\n=================================");
    console.log(`Bulk import completed:`);
    console.log(`Total chapters processed: ${totalChapters}`);
    console.log(`Total checklist items: ${totalChecklistItems}`);
    console.log(`Failures: ${failureCount}`);
    console.log("=================================");

    if (failureCount > 0) {
      process.exit(1);
    }
    process.exit(0);
  }

  const bookId = parsed.bookId || "book-1";
  const locale = parsed.locale || "id";
  const register = parsed.register || "standard";

  console.log(
    `Running import for ${bookId} [${locale}/${register}] (dryRun: ${dryRun})...`
  );

  const opts: ImportOptions = {
    bookId,
    locale,
    register,
    sourcePath: parsed.sourcePath,
    dryRun,
  };

  const report = await importBook(opts);

  console.log("\n--- Import Report ---");
  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    console.error("\nImport finished with errors.");
    process.exit(1);
  } else {
    console.log("\nImport succeeded.");
  }
}

main().catch((err) => {
  console.error("Fatal error during import:", err);
  process.exit(1);
});
