import { notFound } from "next/navigation";
import { getChapterForReading } from "@/modules/reading/access-guard";
import { getActor } from "@/modules/identity/get-actor";
import { ReaderShell } from "@/components/reader/reader-shell";
import { PaywallCard } from "@/components/reader/paywall-card";
import { NameCustomizer } from "@/components/reader/name-customizer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ReaderPageProps {
  params: Promise<{
    locale: string;
    book: string;
    chapter: string;
  }>;
  searchParams?: Promise<{
    reg?: string;
  }>;
}

export default async function ReaderPage({
  params,
  searchParams,
}: ReaderPageProps) {
  const { locale, book, chapter } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const register = resolvedSearchParams?.reg === "casual" ? "casual" : "standard";

  const actor = await getActor().catch(() => null);
  const payload = await getChapterForReading(book, chapter, locale, register, actor);

  if (!payload) {
    notFound();
  }

  return (
    <ReaderShell
      payload={payload}
      currentLocale={locale}
      currentRegister={register}
    >
      {payload.isAllowed ? (
        <article className="space-y-6">
          {/* Real-time Name Customizer for Interactive Dialogues/Scripts */}
          <NameCustomizer targetContainerSelector="#reader-content" />

          {/* Sanitized Chapter HTML Body */}
          <div
            id="reader-content"
            className="prose prose-stone max-w-none leading-relaxed text-[#111113]"
            dangerouslySetInnerHTML={{ __html: payload.html ?? "" }}
          />
        </article>
      ) : (
        /* Paywall Guard: strictly does NOT include paid HTML body */
        <PaywallCard payload={payload} />
      )}
    </ReaderShell>
  );
}
