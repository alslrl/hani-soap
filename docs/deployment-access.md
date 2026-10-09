# Vercel 배포와 데모 접근

결정일: 2026년 10월 9일 KST

사용자 결정에 따라 Next.js 웹앱과 API를 Vercel에 배포한다. PC·아이패드는 같은 HTTPS 주소를 사용한다. 계정 가입·이메일 로그인은 만들지 않고 4자리 PIN으로 데모에 접근한다. 2026년 10월 9일 앱과 PIN 보호를 구현하고 서버 환경을 설정했다. 배포 빌드·보호 API·Supabase 조회·실제 Workflow 브리핑 실행을 확인했다. 최종 배포와 실물 기기 검증 범위는 [구현 상태](implementation-status.md)에 기록한다.

## 4자리 PIN

- `/access`에서 PIN을 입력하고 서버의 `/api/access/unlock`에서 검증한다.
- PIN 해시는 서버 환경 변수에 둔다. 클라이언트 번들·NEXT_PUBLIC 변수·URL·저장소에는 넣지 않는다.
- 성공 시 임의 세션 토큰을 Secure·HttpOnly·SameSite 쿠키로 발급한다. 세션은 서버의 `demo_sessions`에 토큰 해시와 만료 시각으로 저장한다. 초기 유효 기간은 8시간으로 한다.
- 페이지 진입뿐 아니라 환자·파일·AI 작업·실시간 세션 발급·카카오 발송 등 API도 서버에서 세션을 확인한다. 클라이언트 화면 숨기기만으로 보호하지 않는다.
- 변경·AI 실행 요청은 POST와 앱 origin 검사를 사용하고 세션·CSRF 검증을 거친다. 읽기 응답은 사용자 세션에 맞춰 no-store로 처리한다.
- PIN 실패 제한은 IP별 15분에 5회와 배포 전체 시간당 50회를 기본으로 두고 DB에서 공유한다. 서버 인스턴스 메모리에만 횟수를 보관하지 않는다.
- AI 요청에는 세션별 분당 요청 상한·전체 동시 실행 상한을 둔다. 최초안은 세션당 분당 5개 작업, 전체 동시 2개로 시작한다. 동일 입력의 중복 클릭은 기존 작업 ID를 반환한다.
- PIN 변경·로그아웃·관리자 초기화 시 해당 세션을 만료할 수 있게 한다. 클라이언트 세션 만료가 이미 승인돼 실행 중인 작업의 결과를 다른 방문으로 옮기지는 않는다.

## Supabase 접근

이번 데모에는 Supabase Auth 계정·회원 가입을 만들지 않는다. 서버가 PIN 세션을 확인한 뒤 서버 전용 secret으로 기관 범위를 고정해 DB·Storage에 접근한다. 브라우저에는 Supabase secret이나 OpenAI 키를 전달하지 않는다.

애플리케이션 테이블은 RLS를 켜고 anon·authenticated의 직접 접근 권한을 주지 않는다. 서버의 privileged 접근은 각 API의 세션·대상 방문 검사를 거친다. 관리자 키가 RLS를 대신하지 않으므로 서버의 권한 검사를 모든 진입점에 적용한다. [Supabase API 보호](https://supabase.com/docs/guides/api/securing-your-api)

파일은 비공개 Storage로 직접 업로드하되 서버가 지정한 경로와 제한된 업로드 권한만 사용한다. API에는 파일 본문 대신 recording ID·object path를 전달한다. Vercel Function의 요청·응답 본문 한도는 4.5MB이므로 긴 녹음을 일반 API 본문에 싣지 않는다. [Vercel Function 제한](https://vercel.com/docs/functions/limitations#request-body-size)

기기 동기화는 PIN 세션이 있는 앱 API로 최신 버전만 읽는 1초 polling을 초기 방식으로 정한다. 화면이 백그라운드이면 주기를 낮추고 활성화·재연결 때 최신 상태를 다시 읽는다. 시술 확정 직후에는 즉시 재조회한다. 일반 계정 JWT 없이 브라우저에서 Supabase Realtime을 직접 구독하도록 데이터를 공개하지 않는다. 실시간 음성 자체는 PC에서 WebRTC로 전달하므로 이 조회 주기와 별개다.

## AI 작업 실행

맥북의 상시 Node 워커 대신 Vercel Workflow로 전사·사전 보정·진료 분석·SOAP·안내 작업을 실행한다. API는 세션과 요청 상한을 검증하고 DB에 job을 등록한 뒤 Workflow run을 시작한다. 각 단계 결과와 입력 버전을 DB에 남긴다. 브라우저가 닫혀도 등록된 작업은 서버에서 처리한다. [Vercel Workflows](https://vercel.com/docs/workflows)

Workflow에는 job ID만 넘기고 실제 파일·원문·API 자격은 서버 step에서 읽는다. 재시도와 실패 복구는 Workflow 실행부가 담당하고, 앱은 입력 해시·문서 revision·중복 저장 방지를 담당한다. 수동 승인 뒤 다음 작업은 새 run으로 시작해 오래된 입력을 계속 실행하지 않는다.

P2 손글씨 추출은 현재 보호된 단일 API 요청으로 실행한다. 원본 필기 revision이 달라지면 결과 저장을 거절한다. 전사·SOAP·안내·브리핑과 달리 손글씨 추출에는 아직 durable Workflow를 적용하지 않았다.

PIN 보호의 페이지 matcher에서는 Workflow 내부 경로를 별도로 취급한다. 내부 실행 경로를 일반 사용자에게 작업 시작 API로 노출하지 않고 SDK·플랫폼의 검증을 유지한다. 사용자용 작업 시작·결과 API는 PIN 세션을 항상 확인한다. [Workflow Next.js 설정](https://workflow-sdk.dev/docs/getting-started/next)

## 구현 시 준비할 값

Vercel 프로젝트, Supabase 프로젝트 URL·서버 secret, PIN 해시, OpenAI API key, 기능별 모델 설정, 앱 origin을 준비한다. 세션은 임의 토큰의 해시로 서버에서 검증한다. P1 카카오 연결에서는 배포 도메인과 Redirect URI를 등록한다. 실제 값은 문서나 채팅에 기록하지 않는다.

공개 사진은 합성 데모 자산만 사용한다. 원음·전사·환자 기록은 PIN 세션이 있는 API 또는 제한된 파일 URL로 제공한다. 배포 확인은 PC와 실제 아이패드에서 PIN 입력·파일 처리·시술 동기화·세션 만료·미인증 API 차단을 확인한 뒤 완료로 표시한다.
