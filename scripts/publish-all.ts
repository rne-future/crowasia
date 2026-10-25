import { db } from "@/shared/db/client";
import * as schema from "@/shared/db/schema";
import { compileDraft, publishVariant } from "@/modules/content-studio";
import type { Actor } from "@/modules/identity/types";

const adminActor: Actor = {
  userId: "00000000-0000-0000-0000-000000000001",
  verifiedEmail: "admin@crow.asia",
  roles: ["admin", "publisher"],
  authTime: new Date(),
};

async function main() {
  console.log("Publishing all 135 chapter variants...");
  const variants = await db.select().from(schema.chapterVariants);

  let published = 0;
  for (const variant of variants) {
    try {
      const compileResult = await compileDraft(variant.id, adminActor);
      await publishVariant(
        variant.id,
        compileResult.revisionId,
        variant.generation,
        adminActor
      );
      published++;
    } catch (err) {
      console.error(`Failed to publish variant ${variant.id}:`, err);
    }
  }

  console.log(`Successfully published ${published}/${variants.length} chapter variants!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error publishing variants:", err);
  process.exit(1);
});
