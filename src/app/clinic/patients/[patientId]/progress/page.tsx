import { ProgressWorkspace } from "@/components/progress/ProgressWorkspace";

export default async function ProgressPage({ params, searchParams }: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ metric?: string | string[]; visit?: string | string[] }>;
}) {
  const [{ patientId }, query] = await Promise.all([params, searchParams]);
  return <ProgressWorkspace patientId={patientId}
    focusMetric={typeof query.metric === "string" ? query.metric : undefined}
    requestedVisitId={typeof query.visit === "string" ? query.visit : undefined} />;
}
