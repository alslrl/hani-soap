import PatientHistory from "@/components/clinic/PatientHistory";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <PatientHistory patientId={patientId} />;
}
