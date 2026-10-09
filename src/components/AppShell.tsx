"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, HeartHandshake, Settings2, LogOut, Stethoscope } from "lucide-react";
import { useAppState } from "@/lib/client";
import { ActiveRecordingBanner } from "@/components/audio/AudioControls";
export default function AppShell({children}:{children:React.ReactNode}) {
 const path=usePathname(); const {error,data}=useAppState();
 const activeVisit=path.startsWith('/clinic/visits/')?path.split('/')[3]:data?.state.visits.find(v=>v.workflow_status==='in_progress')?.id||data?.state.scenario_inputs[0]?.current_visit_id;
 const logout=async()=>{ await fetch("/api/access/logout",{method:"POST"}); window.location.assign("/access"); };
 return <div className="app-frame"><nav className="app-rail" aria-label="주 메뉴"><Link href="/clinic" className="app-logo" aria-label="HaniSOAP 오늘 환자">H.</Link><Link className={`rail-link ${path==='/clinic'?'active':''}`} href="/clinic"><CalendarDays size={21}/><span>오늘 환자</span></Link>{activeVisit&&<Link className={`rail-link ${path.includes('/visits/')||path.includes('/patients/')?'active':''}`} href={`/clinic/visits/${activeVisit}`}><Stethoscope size={21}/><span>진료실</span></Link>}<Link className={`rail-link ${path==='/clinic/care'?'active':''}`} href="/clinic/care"><HeartHandshake size={21}/><span>후속 관리</span></Link><Link className={`rail-link rail-bottom ${path==='/settings'?'active':''}`} href="/settings"><Settings2 size={20}/><span>설정</span></Link><button onClick={logout} aria-label="잠금" style={{border:0,background:'transparent',padding:12,color:'var(--muted)'}}><LogOut size={20}/></button></nav><main className="app-main"><ActiveRecordingBanner/>{children}</main>{error&&<div role="status" className="connection-toast">{error}</div>}</div>;
}
