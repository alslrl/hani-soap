HaniSOAP Codex 개발 로그 제출용 사본

파일: hani_codex_log.zip
GitHub 다운로드: https://github.com/alslrl/hani-soap/raw/refs/heads/main/docs/codex-logs/hani_codex_log.zip

손세호와 이연화의 Codex 세션 기록 45개(.jsonl), 로그, AGENTS.md를 포함합니다.
원본 ZIP은 별도로 보존하며 이 저장소에는 제출용으로 처리한 사본을 올립니다.

처리 내용
- 확인된 인증값, API 키/토큰 형태 및 데모 접근 PIN을 가림 표식으로 대체했습니다.
- 요청에 따라 이미지 첨부/데이터 URL은 제외하고 표식으로 대체했습니다. 이미지 내용은 검토하지 않았습니다.
- 대화와 명령, 도구 실행 기록의 최상위 행 순서/종류는 유지했습니다.
- SQLite 로그는 원래 WAL을 반영한 독립 사본에서 텍스트 인증값을 가린 뒤 VACUUM했습니다.
- macOS 메타데이터(__MACOSX, .DS_Store)를 제외하고 파일명 인코딩을 정상화했습니다.
- 원본에서 손세호/AGENTS.md는 빈 파일이었으며 원문 상태를 유지했습니다. 프로젝트의 실제 AGENTS.md는 저장소 루트에서 확인할 수 있습니다.

검증
- ZIP 무결성, JSONL 45개 구조, SQLite quick_check 통과.
- 사용한 인증정보 탐지 규칙과 현재 알려진 인증값의 잔여 일치 0건.
- 이 검사는 모든 민감정보가 없다는 보장을 뜻하지 않습니다.

제출용 ZIP 크기: 26487655 bytes
제출용 ZIP SHA-256: 788b17404f8498e156f88677da07312e824a8b80c757a3c60890db233d7c9942
원본 ZIP SHA-256: 4bfa87b7e903bf952aa8c4a483d0cff8e51c2cd5ff84441909a1ce3be98c82b6

상세 검사 결과: verification.json
