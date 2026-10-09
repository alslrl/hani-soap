import { ProgressWorkspace } from "@/components/progress/ProgressWorkspace";

export default async function ProgressPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <ProgressWorkspace patientId={patientId} />;
}
