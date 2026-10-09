# 통증 옆 계단 오르기 불편 점수

2026-10-09. 통증 NRS가 있는 성인 발목 사례의 진료 화면에 ‘계단 오를 때 불편함’을 나란히 배치했다. 작은 화면에서는 두 패널을 세로로 쌓는다. 별도 관리 checkout에서 구현했으며 원본 작업 디렉터리·운영 DB·배포는 변경하지 않았다.

별도 자체 기능 불편 척도로 0~10 정수를 입력·저장한다. 확인 안 된 값은 빈칸이며, 0은 유효한 기록이다. 기존 NRS와 계단 내려가기 기록을 복사하거나 같은 계열로 합치지 않는다. 저장 후 새로고침과 독립 경과 그래프를 지원한다. 배경 갱신은 입력 중인 점수를 덮어쓰지 않는다. 소아 야뇨 사례에는 이 패널을 추가하지 않는다.

저장 조건은 `STAIR_ASCENT_METRIC`에 정의했다.

- instrument: `APP_FUNCTION_DISCOMFORT`
- metric_key: `stair_ascent_discomfort`
- activity_key: `stairs_up`
- measurement_context: `stair_ascent_discomfort`
- body_region/laterality: `ankle`/`right`
- unit/scale: `score`, 0~10

기존 observation.save의 측정 조건 기반 series_key 생성·저장 경계를 사용한다. 미래 방문·다른 환자·다른 척도·미검토 관찰은 그래프에 섞지 않는다.

검증: TypeScript·production build, 별도 측정 계열 검사 2개, 격리 로컬 브라우저 검사 1개 통과. 브라우저에서는 나란한 배치, 미확인 빈칸, 0점 저장, NRS 불변, 재로드, 배경 갱신 중 입력 보존, 11/소수 거절, 경과 화면 한국어 이름, 좁은 화면 넘침 없음, 소아 패널 제외를 확인했다. UI 검증 점수는 합성 로컬 데이터이며 운영 기록에 저장하지 않았다.

메인 통합 시 VisitWorkspace의 TodayFollowupPanels에서 기존 NrsPanel 호출을 두 패널 wrapper로 바꾸는 작은 패치와 새 파일들을 적용한다. 메인에서 진행 중인 NRS 이동·자동 답변/점수 연결이 있다면 보존한다. 향후 분석 후보를 연결할 때도 이 독립 측정 조건을 유지한다.
