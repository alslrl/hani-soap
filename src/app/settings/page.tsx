import AppShell from "@/components/AppShell";
import SettingsView from "./SettingsView";
import { requirePageSession } from "@/lib/server/page-session";
export default async function SettingsPage() { await requirePageSession(); return <AppShell><SettingsView/></AppShell>; }
