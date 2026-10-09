HaniSOAP 문서 및 데모 자료
수집 시각(KST): 2026-10-09T09:38:07+09:00

노션 범위: HaniSOAP 상위 기획 초안 페이지와 하위 페이지 전체 5개.
각 노션 문서는 본문을 요약하지 않고 UTF-8 TXT로 변환했습니다.
제목, 문단, 목록, 체크박스 상태, 인용 내용과 링크를 유지했습니다.
마크다운 표시를 정리하고, 내보내기 내부 문서 링크는 원본 노션 URL로 바꿨습니다.
원본 Markdown 내보내기 ZIP도 notion 폴더에 보관했습니다.

[로컬 문서 업데이트 · 2026-10-09]
- notion/02_HaniSOAP_기획서.txt: chino-meds의 검수한 좌표·2D SVG를 기반으로 부위 선택 → 확대 → 큰 한글 목록에서 혈자리·좌우 체크하는 화면을 만들기로 결정한 내용을 반영했습니다. km-agent 한글 명칭 연결, 데이터·SVG 사용 조건 확인과 실제 iPad·Apple Pencil 검증 항목을 추가했습니다.
- notion/05_재진_대화_녹음_대본.txt: 발목 시술 체크 장면을 같은 흐름으로 맞췄습니다. 녹음 대사는 수정하지 않았습니다.
- 위 두 TXT는 수집 후 편집한 작업 사본입니다. 원본 노션 페이지는 현재 연결에서 찾을 수 없어 동기화하지 않았습니다. 수집 시각과 원본 내보내기 ZIP은 유지했습니다.
- manifest.json의 characters·export_member는 최초 수집 정보를 유지하고, local_revision은 수정한 로컬 파일의 날짜·길이·SHA-256을 기록합니다.

[노션 문서]
- notion/01_해커톤_기획_초안.txt
  제목: HaniSOAP | 10월 9일 해커톤 기획 초안
  원본: https://app.notion.com/p/HaniSOAP-10-9-3f3fb029db3080e9b28bca9ff0ed2521
- notion/02_HaniSOAP_기획서.txt
  제목: HaniSOAP 기획서 (새로 작성 중)
  원본: https://app.notion.com/p/HaniSOAP-3f3fb029db3080db9096cfe60345e8ab
- notion/03_화면_구성_기존_구현_신규_개발_범위.txt
  제목: HaniSOAP | 화면 구성·기존 구현·신규 개발 범위
  원본: https://app.notion.com/p/HaniSOAP-3f3fb029db30808dada3c3405426c259
- notion/04_대회_타임테이블_공식_안내.txt
  제목: 10월 9일(금) 대회 타임테이블 · 공식 안내 기준
  원본: https://app.notion.com/p/10-9-3f3fb029db30807d9b99ec9c4d950878
- notion/05_재진_대화_녹음_대본.txt
  제목: 재진 대화 녹음 대본 (약 1분)
  원본: https://app.notion.com/p/1-3f3fb029db308009b921d42203664598

[진료 음성 및 전사본]
- audio/: 진료영상 1~3 음성 MP3 원본 사본 3개
- transcripts/: 진료영상 1~3 전사 TXT 원본 사본 3개
- 원본 폴더: /Users/sehosohn/.aside/u/0/sessions/2026-10-08_OZs5wRmaY3CDzSYS/artifacts
- 원본 내용은 수정하지 않았으며, 복사 후 SHA-256 일치를 확인했습니다.

[참가자 안내]
- reference/DevDay_Seoul_Participant_Guide.pdf: 참가자 최종 안내 PDF
- reference/DevDay_Seoul_Participant_Guide.txt: PDF 전체 텍스트
- 원본: https://drive.google.com/file/d/1Dsz6MzaljPgnAOQKbz-HTHaIVznwujS4/view

[출처와 검증]
- manifest.json: 문서 출처, 원본 파일 위치, 수집 시각, 복사 파일 SHA-256

[추가 차팅 참고 문서]
- reference/시술_위치_기록.md
  경혈・아시혈・압통점 혼합 기록, 코드 없는 위치・좌우・설명 입력,
  관찰과 시행 구분. 최신 chino-meds 후보와 이전 Atlas 자료를 구분합니다.
- reference/발목_데모_혈자리.md
  사용자 제공 발목 루틴에서 선정한 정규 혈자리 16개와 아시혈,
  KI7 명칭 별칭, 시술별 선택 및 남은 위치·좌우 검수 사항입니다.
- verification/데모_정답차팅_초안.md
  발목 염좌·소아 야뇨 예상 SOAP와 다음 재진 질문, 연화가 확인한
  발목 수치·야뇨 표현의 검수 기록입니다. 전체 음성 최종 검수와 구분합니다.
- reference/재진_질문_및_경과_기록.md
  전체 12개 재진 질문, 호전·동일·악화·불명확 선택과 상세 답변,
  통증·주소증·기능의 방문별 점수 및 다음 방문 자동 표시 요구사항입니다.
- reference/한방_시술_차팅_목록.md
  사용자 제공 시그마차트 화면을 기준으로 시술, 세부 기법, 부위·혈자리,
  치료기기·도구 목록을 정리했습니다. 화면 확인 항목과 추가 등록 후보를 구분합니다.
  이 문서는 수집한 노션 원본과 별도로 작성한 자료입니다.

[변증명·처방명 데이터]
- ../data/변증명_통합.txt: 변증명 594개 통합 목록
- ../data/변증명_출처및정리기준.md: 수집 범위와 명칭 정리 기준
- ../data/변증명_출처기록.json: 항목별 원문·출처 기록
- ../data/변증명_PDF추출.txt, 변증명_온라인.txt, 변증명_PDF파일별.txt:
  출처별 보조 목록
- ../data/처방명_전체.txt: 처방명 11,123개 목록
- ../data/처방명_교재수록.txt: 교재 자료로 표시된 처방명 1,830개
- ../data/처방명_출처및정리기준.md: 수집 범위와 명칭 정리 기준
- ../data/처방명_출처기록.json: 원자료 출처 기록
  용어 인식·차팅 참고용이며, 명칭 목록만으로 진단이나 처방을 결정하지 않습니다.

[구현 계획과 현재 앱]
- implementation-plan.md
  PC·아이패드 웹앱, Next.js·TypeScript·Supabase, PC 단일 수음의 전체 녹음·실시간 처리,
  별도 음성 파일 업로드, 사전·LLM 보정, SOAP 검토, 고객 케어의 전체 구현 계획입니다.
  상세 계획이며 실제 구현 범위와 검증은 implementation-status.md를 기준으로 봅니다.
  현재 대화에서 변경한 녹음 담당과 외부 서버 조건은 이 계획을 기준으로 봅니다.
- implementation-status.md: 코드·DB·실제 AI·브라우저·배포와 남은 기기 검증 상태
- ../README.md: 현재 앱 실행·화면·Supabase·검증 안내

[시그마차트 원본 화면과 UI 초안]
- reference/sigmachart/README.md: 공식 원본 화면 4장 관찰과 HaniSOAP 화면 배치 제안
- reference/sigmachart/images/: 공식 홈페이지 공개 PNG 원본 4장, 이미지 내용 미수정
- reference/sigmachart/source-manifest.json: 원본 URL·파일명·크기·SHA-256·확인 범위
  연화가 별도로 참고한 화면 5장은 원본 파일을 찾지 못했으며 동일 자료로 간주하지 않습니다.

[저장 형식과 배포 결정]
- data-contract.md: 저장 계약 v1과 방문·기록 상태, 두 환자 seed의 데이터 형식
- ../data/demo/demo.schema.json: 엄격한 JSON Schema. 유침시간·약침 약제·용량 입력 제외
- deployment-access.md: Vercel 배포, 4자리 PIN 세션, 서버 API 보호, Workflow 실행
- reference/sigmachart/workflow.md: 공식 접수·차팅·수납 동작에서 확인한 상태 전환
- demo-assets.md, ../data/demo/portrait-assets.json: 합성 환자 사진 2장과 생성 기록
- ../data/demo/patients.seed.json: 가상 환자 2명·6방문·안내·응답·연락 상태의 검증된 seed
- ../scripts/validate_demo_data.py, requirements-demo.txt: 스키마·관계·상태·사진 무결성 검증
  파일 생성·검증과 실제 DB 주입·API 실행·Vercel 배포 완료는 구분합니다.

[Atlas 전신 혈자리 검수]
- verification/atlas-review/index.html: 그림·데이터를 포함한 독립 검수 화면. 브라우저에서 열어 사용.
- verification/atlas-review/README.md: 검수·저장·불러오기와 좌표 보정 범위
- ../output/pdf/atlas_전신_혈자리_검수.pdf: 정규 경혈 361종의 부위별 검수 PDF 72쪽
  화면·문서 공유는 연화 승인 완료. 정확한 혈자리 위치·환자 기준 좌우는 별도 검수하며, 현재 진료 앱을 교체하지 않습니다.
- reference/혈자리_밀집구간_선택_제안.md: 밀집된 점을 터치하면 인근 혈명·코드 후보에서 선택하도록 하는 연화 제안 (구현 전)
