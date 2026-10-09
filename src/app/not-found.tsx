import Link from "next/link";
export default function NotFound() { return <div className="route-error"><h2>찾을 수 없는 화면이에요</h2><Link href="/clinic">오늘 환자로 돌아가기 →</Link></div>; }
