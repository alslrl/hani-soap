# 개발 환경과 실행

HaniSOAP의 실행, 환경 설정, 저장소 연결과 검증 방법을 정리한 개발 안내입니다. 서비스의 목적과 사용 흐름은 [서비스 소개](../README.md)를 참고하세요.

## 실행

Node.js 22.14 이상에서 실행합니다.

```sh
npm ci
npm run dev
```

`http://localhost:3000`에서 개발용 PIN `1234`로 들어갑니다. 기본 저장 위치는 `.hani-data/`입니다. `.env.local`이 이미 있다면 덮어쓰지 마세요. 새 환경에서는 `.env.example`을 참고해 `OPENAI_API_KEY`를 설정합니다. 키가 없으면 파일 저장·수동 기록·시술 입력·모의 후속 관리를 사용할 수 있습니다.

Supabase가 설정된 컴퓨터에서 독립적으로 시험하려면 로컬 저장 모드를 명시합니다. 배포 환경에서는 이 모드를 허용하지 않습니다.

```sh
HANI_STORAGE_MODE=local HANI_DATA_DIR=/private/tmp/hani-soap-test npm run dev
```

## 화면

| 주소 | 기능 |
| --- | --- |
| `/clinic` | 오늘 환자: 대기·진료 중·진료 완료 |
| `/clinic/visits/[visitId]` | 환자 이력, 녹음·업로드, 전사 대조, SOAP 검토, 재진 질문, 시술, 브리핑 |
| `/clinic/patients/[patientId]` | 방문별 승인 기록과 이력 |
| `/clinic/patients/[patientId]/progress` | 같은 측정 조건별 독립 경과 그래프 |
| `/clinic/care` | 안내 승인·모의 발송·모의 응답·연락 처리 |
| `/tablet` | iPad에서 연결할 진료 선택 |
| `/tablet/visits/[visitId]` | 앞뒤 인체, 체크 인식, 부위별 경혈·아시혈·압통점, 시술별 필기 |
| `/settings` | 연결 상태와 iPad 진료 링크 |

PC에서 마이크를 한 번 열어 전체 녹음과 WebRTC 전사를 함께 처리합니다. iPad는 마이크를 사용하지 않습니다. 녹음은 방문 화면을 이동해도 유지되며 공통 녹음 표시에서 원래 방문으로 돌아가거나 종료할 수 있습니다. 브라우저 IndexedDB의 복구 청크는 저장 실패 후 다시 올리거나 내려받을 수 있습니다.

음성 파일은 별도로 업로드할 수 있습니다. 현재 파일당 25MB까지 처리합니다. Supabase에서는 비공개 버킷으로 직접 업로드하며, 전사·보정·SOAP 작업은 Vercel Workflow로 실행합니다. 원문과 이전 버전은 보존하고 용어 후보는 개별 수락 후 새 전사에 반영합니다.

시술 계획과 실제 시행은 별도 상태입니다. iPad의 침·도침·약침·뜸·부항은 각각 선택과 필기를 보존합니다. 체크 표시로 부위 후보를 열며 일반 글씨와 동그라미는 메모로 남깁니다. 손글씨 추출 결과도 원본과 대조해 확인한 뒤 저장합니다.

## Supabase와 Vercel

계정 로그인 없이 PIN 세션을 사용합니다. 서버는 모든 사용자 API에 세션·기관 범위·Origin 검사를 적용합니다. 클라이언트에 Supabase 관리자 키나 OpenAI 키를 전달하지 않습니다. PIN 시도 횟수와 AI 요청 상한은 서버 저장소에서 관리합니다.

Vercel의 서버 환경에는 `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DEMO_PIN_HASH`가 필요합니다. PIN 해시 형식은 `scrypt$SALT$HASH`이며 값은 서버 환경에서만 설정합니다. 허용 Origin은 명시한 `APP_ORIGIN` 또는 해당 Vercel 배포 주소를 사용합니다.

Migration은 `supabase/migrations/`에 있습니다. 배포 대상을 확인하고 적용한 뒤 seed를 넣습니다. Seed는 기존 기록이 있으면 덮어쓰지 않습니다.

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npm run db:seed
```

DB는 정규 테이블과 방문 스냅샷을 동일 트랜잭션에서 저장합니다. 버전 충돌을 거절해 다른 기기의 기록을 조용히 덮어쓰지 않습니다. 임상 테이블과 RPC는 브라우저 역할에 공개하지 않으며 녹음 버킷도 비공개입니다.

## 검증

```sh
npm run typecheck
npm test
npm run test:server
bash scripts/test-database.sh
npm run build
```

브라우저 통합 검증은 [E2E 실행 안내](../tests/e2e/README.md)를 따릅니다. 테스트는 임시 로컬 저장소만 변경하며 외부 모델을 호출하지 않습니다. DB 검증 스크립트는 격리된 임시 PostgreSQL을 만들고 종료합니다.

## 계획과 범위

- [전체 구현 계획](implementation-plan.md)
- [저장 계약](data-contract.md)
- [접근·배포 계약](deployment-access.md)
- [검증 상태](implementation-status.md)

환자 안내는 모의 발송과 카카오 본인 발송을 구분합니다. 설정에서 카카오 계정을 연결하면 승인 문안을 본인의 나와의 채팅에 보낼 수 있습니다. 카카오 링크의 응답은 확인 버튼을 누른 뒤 저장합니다. EMR은 승인 기록 복사를 지원하며 실제 시그마차트 쓰기 연동은 포함하지 않습니다. 인체 화면은 부위별 후보 선택용이며 정밀 경혈 좌표 도구로 검증된 상태는 아닙니다.
