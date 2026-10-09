# 인체 위 혈자리 참고점

2026-10-09. 로컬 구현·검증 완료. 푸시·운영 배포는 이 작업에서 수행하지 않았다.

남성 `body-map-v2`, 여성 `body-map-v3-female`의 현재 도해에 혈명과 경락선 없이 작은 참고점만 겹쳐 표시한다. 원본 인체 PNG, 저장 좌표 버전, 부위 판정, 체크 인식, 선택 팝업, 시술 저장, 손글씨 추출 입력은 변경하지 않는다. 참고점은 `pointer-events: none`, `aria-hidden`이며 원본 필기보다 뒤에 렌더링한다. 이전 도해 기록에는 새 점을 덧붙이지 않는다.

## 위치와 표시 범위

기존 `atlas-review/display-candidates.json`의 점을 부위·경맥 단위로 나누고, 순서를 유지하며 각 도해의 자세·윤곽 안에 맞춘 **화면 표시 후보**다. 정확한 취혈 위치를 검수·승인한 결과가 아니다. 원본 검수 파일과 임상 상태는 보존하며 새 자료에도 `clinical_approval: false`, `clinical_review_status: pending`을 기록한다. 화면에 ‘혈자리 참고점 (검수 전)’을 표시한다.

- 303종을 양측 또는 정중선 인스턴스로 표시: 각 모델 앞면 368점, 뒷면 188점.
- 옆면 전용·발바닥·회음의 보이지 않는 면 58종은 임의로 앞·뒤에 배치하지 않는다. 기존 전신 361종 검색·선택에는 계속 포함된다.
- Atlas 3D 배포 자료도 조사했지만 일부 손·허리 위치가 현재 도해의 해당 부위와 맞지 않아 좌표·뷰어 코드를 복제하지 않았다.
- 등록 자료와 모델의 출처·변경·라이선스는 `public/demo/acupoints/ATTRIBUTION.html`에 표시한다.

생성기는 Python 표준 라이브러리만 사용하며 원본 검수 자료와 남녀 윤곽 SHA-256을 기록한다. `--check`는 파일을 쓰지 않는다.

```sh
python3 scripts/build_anatomy_acupoint_overlay.py --check
npx vitest run src/lib/tablet/acupoint-reference.test.ts src/lib/tablet/geometry.test.ts src/lib/tablet/female-anatomy.test.ts src/lib/tablet/anatomy-geometry.test.ts
```

## 검증

- TypeScript와 관련 검사 18개 통과. 모든 표시점이 해당 모델의 피부 윤곽 안에 있고 환자 좌우·정중선과 코드가 일치함을 확인했다.
- 별도 스냅샷에서 Next.js production build 통과. 메인 작업의 서버·데이터·환경 변수·빌드 출력은 사용하지 않았다.
- 별도 로컬 데이터의 브라우저에서 남녀 앞면 368점·뒷면 188점, 약침 전환, 점 위 직접 선택→기존 손 부위 팝업→합곡 우측 선택·저장을 확인했다.
- 점 위 메모→초안 저장→새로고침 후 원본 메모 1획 유지. 저장된 annotation에는 참고점이 들어가지 않고 선택한 시술·좌우도 유지됐다.
- 브라우저 오류 없음. 운영 DB·AI 키·실제 음성 입력은 사용하지 않았다.

React 검토: 점 데이터는 정적 import, 점 레이어는 primitive props를 받는 memo 컴포넌트다. 필기 중 전체 점 배열의 생성·좌표 계산이나 네트워크 호출을 하지 않는다. 참고점에는 클릭·키보드 포커스·시술 확정 동작이 없다.
