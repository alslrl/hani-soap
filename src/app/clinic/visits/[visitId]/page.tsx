import VisitWorkspace from "@/components/clinic/VisitWorkspace";

export default async function VisitPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  return <VisitWorkspace visitId={visitId} />;
}
