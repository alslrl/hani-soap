import { TabletWorkspace } from "@/components/tablet/TabletWorkspace";
export default async function TabletVisitPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return <TabletWorkspace visitId={visitId} />;
}
