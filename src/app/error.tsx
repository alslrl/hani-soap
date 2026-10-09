"use client";
export default function ErrorPage({reset}:{reset:()=>void}) { return <div className="route-error"><h2>화면을 불러오지 못했어요</h2><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button onClick={reset}>다시 불러오기</button></div>; }
