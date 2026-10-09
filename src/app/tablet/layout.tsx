import { requirePageSession } from "@/lib/server/page-session";
import "./tablet.css";
export default async function TabletLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  return children;
}
