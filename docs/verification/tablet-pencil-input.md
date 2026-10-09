# 태블릿 펜 입력과 스크롤 보정

2026-10-09. 로컬 수정·검증 완료. 사용자가 이 변경의 커밋·푸시·운영 배포를 요청했다. 실물 iPad / Apple Pencil 검증은 아직 수행하지 않았다.

## 확인한 문제

기존 입력은 손바닥을 포함한 touch 접촉 즉시 부위 팝업을 열었고, 다른 포인터의 취소도 현재 펜 필기를 지웠다. `isPrimary`가 false인 펜 접촉은 시작하지 않았다. SVG에는 `touch-action: none`이 있지만 바깥 HTML 캔버스·문서에는 같은 스크롤 방지가 없었고, 가로 화면의 최소 높이가 실제 화면보다 커질 수 있었다.

## 변경

- 펜은 필기 우선이다. 다른 접촉이 있거나 직접 선택 모드였어도 펜 필기를 받는다. 마우스의 기존 직접 선택·필기는 유지한다.
- 손가락 선택은 짧은 탭이 끝날 때만 실행한다. 이동·오래 누르기·큰 접촉·필기 직후 남은 touch는 기본 모드에서 팝업을 열지 않는다. 명시적인 직접 선택은 의도한 큰 손가락 탭도 받는다.
- 입력 ID를 추적해 손바닥의 move/up/cancel이 펜 획을 끊지 않는다. 실제 펜의 capture loss/cancel은 이미 받은 획을 메모로 보존한다.
- 펜 접촉 시작 때 화면→원본 좌표 변환을 고정하고, 지원하는 브라우저에서는 coalesced samples를 읽는다. 캡처를 사용할 수 없거나 SVG 밖에서 끝나는 경우는 window 핸들러가 마무리한다.
- 인체 화면을 viewport 안에 고정한다. 문서와 캔버스 HTML 영역의 pan/overscroll을 막고 캔버스의 native touch 이벤트에 non-passive 차단을 적용한다. 후보·기록 패널의 자체 세로 스크롤은 유지한다. 화면을 떠나면 문서 잠금을 해제한다.
- 기존 1000×1000 원본 좌표, normalized 저장, 남녀 도해, 점 레이어, 시술별 필기와 승인 경계는 유지한다.

입력 규칙 참고: [W3C Pointer Events — primary pointer](https://www.w3.org/TR/pointerevents3/#the-primary-pointer), [touch-action과 직접 조작](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property).

## 검증

- TypeScript 및 입력·체크·원본 좌표·남녀 도해 관련 검사 25개 통과.
- 별도 로컬 스냅샷의 Next.js production build 통과. 원본 서버·데이터·API 키는 사용하지 않았다.
- 브라우저 입력 시뮬레이션: non-primary 펜 + 손바닥 cancel/up에도 메모 유지, 실제 펜 중단 획 보존 + 다음 획 시작, 펜 체크→우측 발목 후보→구허 선택·저장, 손가락 짧은 탭→손 후보.
- 세로 834×1194와 가로 1024×768에서 문서 높이=viewport 높이, scrollX/Y=0. 캔버스 위 실제 스크롤 입력 전후 rect는 x=0,y=223,width=834,height=897로 유지됐다.
- native touchstart/move의 defaultPrevented 확인. 후보 패널의 선택·하단 추가 버튼 동작도 유지됐다.
- 저장·새로고침 후 메모 3획 + 체크 1획 유지. 실제 마우스 드래그 한 획도 추가·저장되어 총 5획이 남았다. 방문 선택으로 나간 뒤 문서 lock class가 제거됐다. 브라우저 오류 없음.

브라우저에서 펜 이벤트를 재현한 검증과 실물 Apple Pencil 검증은 다르다. 실물 Safari에서 펜/손바닥 동시 접촉과 길게 필기할 때의 동작은 배포 후 확인해야 한다.

테스트용 버튼·시뮬레이션 HTML은 임시 스냅샷에만 두었다. 이 로컬 fixture는 iframe 테스트를 위해 임시로 `SAMEORIGIN` 헤더를 사용했고, 저장소의 `X-Frame-Options: DENY`는 변경하지 않았다.
