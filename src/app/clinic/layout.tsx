import AppShell from "@/components/AppShell";
import { requirePageSession } from "@/lib/server/page-session";
export default async function ClinicLayout({children}:{children:React.ReactNode}) { await requirePageSession(); return <AppShell>{children}</AppShell>; }
