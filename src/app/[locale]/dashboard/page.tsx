import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity/get-actor";
import { getUserDashboard } from "@/modules/search/service";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import type { Actor } from "@/modules/identity/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DashboardPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;

  let actor: Actor;
  try {
    actor = await requireActor();
  } catch (_err) {
    redirect(`/${locale}/login`);
    return null;
  }

  const data = await getUserDashboard(actor.userId, actor.verifiedEmail);

  return <DashboardView data={data} locale={locale} />;
}
