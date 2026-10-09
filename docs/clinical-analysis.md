# 전사 기반 진료 분석

현재 방문의 최신 전사를 `OPENAI_MODEL_ANALYSIS`(기본 `gpt-6.1-sol`, reasoning medium)로 분석한다. 새 임상 테이블이나 seed 재설정은 없다. `jobs.kind=analysis`, `result.task=clinical_analysis`에 후보·미확인 질문·검토 상태·count-only 개인정보 점검을 저장한다. 공유 `clinical-analysis-context.ts` 계약을 변경하지 않는다.

부모 통합 지점은 `src/lib/ai/clinical-analysis-jobs.ts`의 다음 함수다.

```ts
ensureClinicalAnalysis(visitId: string, transcriptId?: string, sessionId?: string): Promise<{
  jobId?: string; reused?: boolean;
  execution?: 'workflow' | 'local_synchronous'; error?: string;
}>
```

최신 전사로 SOAP를 저장한 뒤, 부모의 서버/Workflow step에서 `await ensureClinicalAnalysis(visitId, transcript.id, originalJob.session_id)`를 호출한다. 기존 동일 입력 작업은 재사용한다. PIN의 AI 실행 한도·모델/저장 오류는 분석 작업 또는 안전한 error 반환으로 처리하므로 전사/SOAP를 실패시키지 않는다. `HANI_SYNC_AI=1`인 격리 로컬 실행 외에는 `analyzeClinicalWorkflow`를 내구성 Workflow로 dispatch한다. 화면 새로고침이나 polling은 모델을 호출하지 않는다. 이 작업에서는 부모 pipeline/workflow/jobs를 수정하지 않았다.

수동 API는 `POST /api/clinical-analysis`이며 visitId, patientId, transcriptId, expectedTranscriptRevision을 받는다. `GET`은 해당 방문 분석 작업만 반환한다. 두 API의 PIN 인증, POST Origin, 같은 환자·방문·최신 전사 검증을 유지한다. 검토 API는 `POST /api/clinical-analysis/review`이다. jobId/candidateId/visitId/patientId/expectedTranscriptRevision과 decision(confirm/reject), 선택적인 edit(text/value)를 받는다. 서버가 제공한 후보 ID만 사용할 수 있다.

답변은 questions.ts의 12항목과 세부 키에 한정한다. 후보 내용은 모델 요약 대신 실제 인용문을 저장한다. 모르는 역할·질문·미응답·계획·과거 수치는 오늘 측정으로 만들지 않는다. 환자/보호자의 보고 또는 의료진이 측정·확인했다고 명시한 구간만 측정 근거로 허용한다. 과거 숫자의 좁은 부분 인용도 원래 구간 앞뒤 시점을 검증한다. 현재 NRS 0은 유효하고 NRS는 0~10 정수/score다. 소변 횟수는 FREQUENCY이며 밤 빈도는 기존 episodes_per_night 단위로 저장한다. 답변 시점은 current/recent로 보존하고 치료 후 반응·실제 복약 등 회고 질문에는 최근 보고를 허용한다. 직접 걱정/효과 질문/이해 부족/실천 어려움/미해결 질문은 직접 표현 근거가 있을 때만 후보로 남기며 숨은 감정이나 이탈 가능성을 추론하지 않는다.

확인 전에는 기존 followup_answers/observations/contact_tasks에 반영하지 않는다. 확인은 기존 저장 action을 한 번의 updateState 트랜잭션에서 호출하고 원래 provided_transcript source_id/정확한 quote를 보존한다. 의료진 수정은 추가 manual 출처와 candidate.manual_review로 보존한다. 신호는 ReviewedPatientSignal 타입과 일치하며 source_refs는 음성 전사 근거만 사용하고 수기 편집 근거는 후보 검토 메타데이터에 별도 기록한다.

기존 의료진 답변/같은 측정 조건의 값이 있으면 ANALYSIS_ENTRY_CONFLICT로 현재 입력과 targetHash를 반환한다. UI의 명시적인 ‘현재 기록을 후보로 교체’ 선택과 일치하는 expectedTargetHash가 있어야 반영된다. 이전 답변/측정은 candidate.replaced_target 및 기존 state revision에 보존하며 측정은 append-only다. 이미 확인/제외한 동일 후보·동일 요청은 임상 항목을 추가 생성하지 않는다. 다른 편집 요청은 기존 입력 화면에서 수정하도록 거부한다. 새 전사나 생성 중 입력 변경은 stale로 처리하며 확인을 막는다. 승인 SOAP와 모든 전사 버전은 기존 불변성 검사를 유지한다.

UI는 FollowupEditor에만 연결했다. 편집 중인 직접 답변이 있으면 먼저 저장해야 후보를 반영할 수 있다. 확인·제외·직접 수정·충돌 교체가 명시적이며, 미확인 항목은 질문 목록으로 남는다.

검증은 합성 전사/격리 로컬 저장소만 사용했다. 과거8/현재5·현재0·미응답 질문·보호자 야뇨2·직접 걱정/이해/실천 어려움, exact source/quote, 후보 확인·편집·중복·충돌·stale/PIN/Origin/환자 범위, 원문/승인 기록 보존, outbound 개인정보 가림과 audit count, Vercel Workflow dispatch 및 nonfatal 실패를 테스트한다. 실제 provider 호출은 합성 샘플3건으로 제한했다. 운영 배포와 초기 자동 hook 통합은 부모 작업에서 수행한다.

## 전사 근거 답변 초안과 단일 NRS 입력

답변 후보는 질문의 실제 상세 답변 입력칸에도 `전사 기반 AI 초안 · 검토 전`으로 채운다. 미응답 항목은 빈 값/미확인 상태를 유지한다. 저장된 의료진 답변이나 로컬에서 편집 중인 답변·측정값은 자동으로 바꾸지 않는다. 현재는 FollowupEditor 전체 dirty guard를 사용한다. 후보 도착도 hydration signature에 반영하므로, 화면 새로고침 없이 빈 답변에 초안이 표시된다. 모델은 화면 polling에서 호출하지 않는다.

미확인 초안 저장은 `POST /api/clinical-analysis/answers`로 처리한다. visitId/patientId/answers/transcriptDrafts/expectedVersion을 받는다. transcriptDrafts는 candidateId/jobId/item_key/subitem_key/transcriptId/transcriptRevision/expectedTarget 연결 정보다. 서버는 저장 전에 같은 최신 전사와 정확한 원문 인용, 초안을 채울 때의 기존 답변 signature를 검증한다. 이후 기존 followup.save와 source_refs 부착을 같은 updateState 트랜잭션에서 수행한다. 초안은 review_status=draft이며 명시적인 confirmation_status=confirmed 선택이 있을 때만 reviewed로 바뀐다. 의료진 텍스트 수정에는 원래 음성 인용과 manual 출처를 함께 남기고 후보 검토 메타데이터에도 연결한다. 빈 답변은 확인 완료로 자동 승격하지 않는다. 기존 actions.ts는 수정하지 않는다.

공유 순수 helper `getTranscriptNrsProposal(state,visitId,match)`는 `{jobId,candidate,transcriptRevision,patientId}` 또는 undefined를 반환한다. match는 metric_key/instrument/body_region/laterality/activity_key/measurement_context를 포함한다. 현재 pending NRS/score/0~10 정수와 실제 전사 인용만 사용하며, 부위가 null인 모호한 값·다른 부위·좌우·활동·측정 조건·과거 전사·FREQUENCY는 제외한다. 발목의 명시적인 한글/영문 표기만 안전하게 정규화한다. 오늘 같은 조건의 값이 이미 저장되어 있으면 제안을 반환하지 않는다. NrsPanel의 로컬 dirty/자동 초안 바인딩과 저장은 부모에서 담당한다.

ClinicalAnalysisReview와 FollowupEditor의 선택적 nrsTarget은 기존 target의 metric_key/body_region/laterality/activity_key/measurement_context/inputId 형태와 호환된다. 일치하는 NRS 후보는 읽기 전용 제안/원문과 ‘통증 NRS 입력으로 이동’ 버튼만 표시하고 후보 숫자 편집·별도 값 확인 UI는 만들지 않는다. 다른 조건 측정과 소변 횟수는 기존 검토 카드로 유지한다. 이 변경에서 별도 NRS navigation 커밋 eb434는 cherry-pick하지 않았으며 부모의 기존 editableMetrics/openNrs 연동과 함께 통합한다.
