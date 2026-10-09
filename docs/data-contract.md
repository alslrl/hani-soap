# HaniSOAP 저장 계약 v1

결정일: 2026년 10월 9일 KST

사용자가 위임한 저장 형식을 v1으로 정했다. 관계형 Postgres의 환자·방문을 중심으로 기록·시술·질문·측정·안내·응답을 연결한다. 원음은 Storage, 임상 내용과 버전은 DB에 저장한다. 아래의 상태와 키를 API·UI·데모 seed에 동일하게 사용한다.

## 데모 저장 파일

- 스키마: [demo.schema.json](../data/demo/demo.schema.json)
- 생성·검증한 seed: [patients.seed.json](../data/demo/patients.seed.json)
- 사진 목록: [portrait-assets.json](../data/demo/portrait-assets.json)

데모는 성인 발목 염좌와 소아 야뇨의 두 환자로 구성한다. 환자 ID는 가상 UUID, 연락처는 null, 사진은 준비한 합성 자산을 사용한다. 기존 대화의 역할 참여자 실명·생년월일을 복사하지 않는다.

## 관계와 기본값

| 묶음 | 저장 단위 |
| --- | --- |
| 환자 | patients. 사진·보호자·주소증을 포함하되 오늘 상태는 방문에 저장 |
| 방문 | visits. 환자별 visit_no와 시간, workflow_status와 record_status 분리 |
| 기록 | transcripts와 soap_documents. revision으로 원문·수정·승인 버전 보존 |
| 시술 | treatments. modality별 부위·좌우·혈자리를 독립 보존 |
| 재진 질문 | followup_answers. 12개 item_key와 세부 subitem_key, 변화·확인·해당 여부를 별도 저장 |
| 측정 | observations. NRS·기능 불편·빈도별 instrument와 series_key를 구분 |
| 다음 확인 | followup_items. 미해결 항목과 해결 방문을 저장 |
| 복약 과정 | medication_courses. 확인된 시작·종료·복용 정보. 모르는 값은 null |
| 후속 관리 | care_messages, care_responses, contact_tasks. 문안 승인·응답·연락 처리 분리 |

사용자 데이터에는 clinic_id를 두고 부모·자식의 기관과 환자가 일치하도록 검사한다. 시간은 UTC date-time, 생년월일·복용 날짜는 date로 저장하며 화면은 KST로 표시한다. JSON의 null은 미확인 값이며 0이나 빈 문자열로 대체하지 않는다.

seed의 `soap_documents`는 DB의 `visit_documents`에서 kind=soap인 행으로, `treatments`는 `treatment_entries`로 매핑한다. `scenario_inputs`는 데모 실행용 메타데이터이며 환자 임상 테이블로 넣지 않는다. 접근 세션·API 자격·실행 중인 AI job은 seed에 포함하지 않는다. 서버가 계산하는 입력 해시·승인 해시·작업 run ID는 실제 import·실행에서 채운다.

## 방문 상태

| 코드 | 화면 | 전환 |
| --- | --- | --- |
| waiting | 대기 | 오늘 방문을 생성하거나 데모를 초기화할 때 |
| in_progress | 진료 중 | 진료 시작 또는 해당 방문의 첫 녹음·파일 처리 시작 |
| completed | 진료 완료 | 의료진이 오늘 진료 마침을 선택할 때 |

환자 이름을 눌러 화면을 여는 것만으로 상태를 바꾸거나 새 방문을 생성하지 않는다. 녹음 종료는 오디오만 끝내며 방문을 자동 완료하지 않는다. 활성 녹음을 종료·보존한 뒤 방문을 완료한다. AI 작업은 해당 방문에서 계속 처리할 수 있다.

기록 상태는 empty, draft, review_needed, approved로 별도 저장한다. 방문 완료 후에도 기록이 검토 필요일 수 있다. SOAP 승인은 기록 상태를 approved로 만들고 방문의 치료·수납 완료를 대신하지 않는다. 다시 진료하기는 명시적인 재개 동작으로 기록한다.

시그마차트의 완료 열에는 수납 흐름도 포함된다. HaniSOAP은 수납을 구현하지 않으므로 방문 완료는 명시적 의료진 동작으로 정하고 시그마차트의 수납 완료와 동일하다고 설명하지 않는다.

## 현재 시술 필드

필수 입력은 시술 종류, 부위·좌우와 확인한 위치다. 위치는 정규 경혈 또는 코드 없는 아시혈·압통점으로 기록할 수 있다. 인체의 체크는 후보를 여는 명령이고 혈자리 자체를 자동 확정하지 않는다.

`treatments.locations`는 위치별 location_type, nullable acupoint_code, 부위·좌우·설명, annotation_id와 finding_ref를 담는 선택 필드다. 경혈에는 코드를 저장하고 아시혈·압통점에는 코드를 임의 부여하지 않는다. 기존 acupoints는 정규 경혈의 호환용 표현이며 코드 없는 위치를 투영하지 않는다. 압통 관찰은 O의 소견, 시행 확인은 P의 시술로 구분한다. [연화의 위치 기록 요구](reference/시술_위치_기록.md)를 따른다.

| 음성 표현 | modality | technique |
| --- | --- | --- |
| 침을 놓겠다는 표현 | acupuncture | standard_acupuncture |
| 도침 | acupuncture | needle_knife |
| 약침 | pharmacopuncture | null |

실시간 음성은 시술·기법 후보를 아이패드에 보여준다. 약침·도침을 일반 침으로 중복 감지하지 않도록 긴 용어를 우선 처리한다. 과거·부정·계획 표현도 구분하고 현재 입력 중인 시술 탭을 자동으로 바꾸지 않는다. 실제 시술 확정은 의료진이 한다.

이번 버전에는 유침시간, 약침 약제·농도·용량 입력을 넣지 않는다. 해당 필드는 seed 스키마에서도 허용하지 않는다. 원문에 값이 있더라도 전사 원문은 보존하고 별도 시술 필드 추출·입력은 생략한다.

## 근거와 가상 이력

각 임상 내용에는 provided_case, synthetic_history, synthetic_response, manual_demo 중 출처 성격을 보존한다. 실제 제공 대화에 있는 사실과 자연스럽게 구성한 과거 방문·응답을 구분한다. 가상 이력은 실제 치료 효과 검증 자료로 쓰지 않는다.

제공 사례의 비교 기준은 [연화 검수 SOAP](verification/데모_정답차팅_초안.md)를 우선한다. 발화된 평가명은 의료진의 설명으로 기록하고 임상적 확진·타당성 검증으로 확대하지 않는다. 치료 계획을 시행 완료로 바꾸거나, 재내원 시점을 처방 일수로 바꾸지 않는다. 기존 최초 전사본은 보존한다.

재진 질문의 오늘 답변은 빈 상태에서 시작한다. 지난 방문 점수를 오늘 값으로 복사하지 않는다. 확인되지 않은 통증은 측정값 행을 만들지 않으며 소아의 야간 배뇨 횟수를 통증 NRS로 저장하지 않는다. 동일 항목·척도·부위·좌우·활동·측정 조건의 값만 같은 series_key로 비교한다.

메시지의 approved_body를 고정하고 발송 시 재생성하지 않는다. 불편 응답의 상세 선택이 없어도 contact_task를 만든다. 긍정 응답으로 기존 연락 작업을 자동 삭제하지 않는다. 기록의 승인·발송은 실제 요청 결과와 seed 스냅샷을 구분한다.

예정일 규칙은 day3=복용 시작일을 1일차로 센 3일차(+2일), week1=시작일로부터 7일 후, end_minus3=확인된 종료일의 3일 전으로 고정한다. KST 날짜로 계산하고 발송 시각을 붙여 UTC로 저장한다. 시작·종료일이 없으면 해당 일정을 추정해 만들지 않는다.

## 파일 검증

JSON Schema의 형식·필수값·enum 검증 뒤 관계·시간·상태 검증을 수행한다. 같은 ID 중복, 다른 환자 방문 연결, 범위를 벗어난 NRS, 현재 대기 방문의 과거 답변 자동 복사, 승인 문안 없는 발송, 불편 응답의 연락 작업 누락을 거절한다.

확정 스키마와 원본 시나리오·사진을 서브 에이전트에 전달해 두 환자의 seed를 생성했다. JSON Schema와 관계·상태 검증 및 30개 메모리 내 오류·경계 변형 검사를 통과했다. 실제 DB migration·seed 주입과 앱 배포는 아직 수행하지 않았다.
