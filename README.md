# HaniSOAP

[English](#english) | [한국어](#한국어)

## English

**Open-source charting and clinical documentation automation for Korean medicine clinics.**

HaniSOAP turns consultation conversations and procedure notes into draft SOAP charts, then connects clinician-reviewed records to patient guidance and follow-up visits. It aims to reduce repetitive documentation work alongside an existing EMR, not replace the EMR or automatically diagnose, prescribe, or decide treatment.

> This is a prototype for development and evaluation, with clinician review required. It is not a production-ready EMR or a validated medical device. Original project code is available under MIT; third-party illustrations and data retain their separate CC or public-data terms. Read the [license scope](#license) before reuse.

### Features

- **From consultation audio to chart drafts:** Record or upload audio, compare transcripts, review Korean medicine terminology suggestions, and edit SOAP drafts.
- **Tablet procedure notes:** Mark body regions, acupoints, laterality, and handwriting on iPad anatomy illustrations, linked to the same visit.
- **Clinician approval:** Keep AI drafts separate from reviewed records and prepare patient guidance from edited, approved content.
- **Follow-up and return visits:** Review guidance, responses, contact tasks, and previously approved records at the next visit.
- **Alongside an existing EMR:** Copy approved records for transfer. Direct writes to external EMRs and billing are not included.

### Quick start

Requires Node.js 22.14 or later.

```sh
git clone https://github.com/alslrl/hani-soap.git
cd hani-soap
npm ci
npm run dev
```

Open `http://localhost:3000` and use the development PIN `1234`. Without API keys, you can try manual records, procedure input, and simulated follow-up. For real AI calls, use `.env.example` to configure keys in a new `.env.local`. Do not overwrite an existing environment file.

Do not expose the default PIN on a shared computer or external server. Use fictitious data for local testing. Follow the [development guide](docs/development.md) for isolated testing when Supabase is configured, deployment settings, and features that incur costs.

### Current scope and limitations

- Implementation centers on ankle-sprain and pediatric-enuresis demo scenarios. Synthetic profiles and simulated progress are not evidence of treatment outcomes.
- AI-generated transcripts, records, guidance, and handwriting extraction require clinician review. The app does not automatically finalize diagnoses, prescriptions, or procedure decisions.
- Patient guidance distinguishes simulated sending from Kakao self-messaging. It is not an automatic messaging service for patients.
- Illustration points and regions assist data entry. They have not been validated as a tool for locating precise acupoint positions.
- Masking identifiers in some text does not guarantee full de-identification. The same masking does not cover original audio, real-time audio, or handwriting images. See the [privacy scope and limitations](docs/text-privacy.md).
- Do not use the prototype for real-patient operations before strengthening the default PIN, authorization, audit, retention and deletion policies, and clinical validation.

### Development and contributions

```sh
npm run check:public-files
npm run typecheck
npm test
npm run test:server
```

These are development checks, not a claim that all tests or end-to-end workflows have passed. Consult the [development guide](docs/development.md) for database, build, and browser integration checks.

The public repository contains code, tests, technical documentation, and demo assets subject to review. Do not publish developer conversation logs, original clinical audio or transcripts, Notion exports, presentation materials, credentials, or operational data. The public-file checker cannot verify all historical content, personal information in images, or every secret. See [publication safety](docs/publication-safety.md) for publication boundaries, history-handling procedures, and verification limitations.

- [Contributing](CONTRIBUTING.md)
- [Maintenance plan and release criteria](docs/maintenance.md)
- [Publication safety and history handling](docs/publication-safety.md)
- [Reporting security vulnerabilities](SECURITY.md)
- [Development and deployment](docs/development.md)
- [Data storage contract](docs/data-contract.md)

### License

Original application code and original technical documentation that the project has the rights to license are covered by the [MIT License](LICENSE). MIT does not override existing notices or apply automatically to third-party materials. Dependencies retain their own licenses.

In particular, illustrations, models, terminology, reference data, and images in `data/` and `public/demo/` are not covered by a blanket MIT grant. Anatomy and illustration assets retain CC BY or CC BY-SA terms, and terminology names retain their source public-data permissions. Unverified private-PDF/guideline name sources and copied upstream location prose were excluded. See [third-party notices and source conditions](THIRD_PARTY_NOTICES.md). These are scoped source checks, not a blanket legal guarantee or a solely MIT-licensed asset bundle.

[Back to language navigation](#hanisoap)

## 한국어

**한의원의 차팅과 진료 기록 업무를 자동화하기 위한 오픈소스 웹앱입니다.**

HaniSOAP은 진료 중 나눈 대화와 시술 기록을 SOAP 차트 초안으로 정리하고, 의료진이 검토한 기록을 환자 안내와 다음 재진으로 연결합니다. 기존 EMR을 대체하거나 자동으로 진단·처방·시술을 결정하는 프로그램이 아니라, 기존 EMR과 병행하며 반복적인 기록 업무를 줄이기 위한 보조 도구를 지향합니다.

> 현재는 의료진의 검토가 필요한 개발·평가용 프로토타입입니다. 실환자 진료에 바로 사용할 수 있는 상용 EMR이나 검증된 의료기기가 아닙니다. 프로젝트의 원본 소스 코드는 MIT 라이선스로 공개하며, 외부 도해·데이터는 별도 CC 라이선스나 공공데이터 이용조건을 따릅니다. 재사용하기 전에 [라이선스 적용 범위](#라이선스)를 확인하세요.

### 주요 기능

- **진료 음성에서 차트 초안까지:** 녹음·파일 업로드, 전사 대조, 한의학 용어 보정 후보, SOAP 초안 검토를 지원합니다.
- **태블릿 시술 기록:** iPad의 인체 도해에서 부위·혈자리·좌우·필기를 기록하고 같은 방문의 차트와 연결합니다.
- **의료진 승인:** AI 초안과 확인한 기록을 구분하고, 수정·승인한 내용으로 환자 안내를 준비합니다.
- **후속 관리와 재진:** 안내·응답·연락 작업과 과거 승인 기록을 다음 방문에서 확인합니다.
- **기존 EMR과 병행:** 승인 기록을 복사해 옮깁니다. 외부 EMR에 직접 쓰거나 청구하는 기능은 포함하지 않습니다.

### 빠른 시작

Node.js 22.14 이상이 필요합니다.

```sh
git clone https://github.com/alslrl/hani-soap.git
cd hani-soap
npm ci
npm run dev
```

로컬 개발 주소는 `http://localhost:3000`이며 기본 개발 PIN은 `1234`입니다. API 키가 없으면 수동 기록·시술 입력·모의 후속 관리부터 시험할 수 있습니다. 실제 AI 호출이 필요하면 `.env.example`을 참고해 새 `.env.local`에 키를 설정하세요. 기존 환경 파일은 덮어쓰지 마세요.

공유 컴퓨터나 외부 서버에 기본 PIN으로 노출하지 마세요. 로컬 시험에는 가상 데이터만 사용하세요. Supabase가 설정된 환경의 독립 시험, 배포 설정과 비용이 발생하는 기능은 [개발 안내](docs/development.md)를 따르세요.

### 현재 범위와 주의사항

- 발목 염좌·소아 야뇨의 데모 시나리오를 중심으로 구현되어 있습니다. 합성 프로필·가상 경과는 실제 치료 성과가 아닙니다.
- AI가 생성한 전사·기록·안내·필기 추출 결과는 의료진의 검토 대상입니다. 진단·처방·시술 결정을 자동 확정하지 않습니다.
- 환자 안내는 모의 발송과 카카오 본인 발송을 구분합니다. 일반 환자에게 자동 발송되는 서비스로 설명하지 않습니다.
- 도해의 점과 영역은 입력 보조입니다. 정확한 경혈 위치를 판정하는 도구로 검증되지 않았습니다.
- 텍스트 일부의 식별정보 가림은 완전한 비식별화를 보장하지 않습니다. 원음·실시간 음성·필기 이미지에는 같은 가림이 적용되지 않습니다. [처리 범위와 한계](docs/text-privacy.md)를 확인하세요.
- 기본 PIN, 권한·감사·보존·삭제 정책, 임상 검증 등을 보강하기 전에는 실환자 운영에 사용하지 마세요.

### 개발과 기여

```sh
npm run check:public-files
npm run typecheck
npm test
npm run test:server
```

위 명령은 개발 시 실행할 검사이며, 모든 테스트나 전체 사용자 흐름의 검증이 완료됐다는 뜻이 아닙니다. 데이터베이스·빌드·브라우저 통합 검증은 [개발 안내](docs/development.md)를 참고하세요.

공개 저장소에는 코드·테스트·기술 문서와 검토 대상 데모 자산을 관리합니다. 개발자의 대화 로그, 진료 원음·전사 원본, 노션 내보내기, 발표자료, 인증정보와 운영 데이터는 올리지 않습니다. 공개 파일 검사만으로 과거 이력·이미지 속 개인정보·모든 비밀값을 검증할 수는 없습니다. 공개 범위, 이력 처리 절차와 검증의 한계는 [공개 파일 관리 안내](docs/publication-safety.md)를 확인하세요.

- [기여 방법](CONTRIBUTING.md)
- [유지관리 계획과 릴리스 기준](docs/maintenance.md)
- [공개 파일 관리와 이력 처리](docs/publication-safety.md)
- [보안 취약점 제보](SECURITY.md)
- [개발·배포 안내](docs/development.md)
- [데이터 저장 구조](docs/data-contract.md)

### 라이선스

프로젝트가 권리를 가진 원본 애플리케이션 코드와 자체 기술 문서는 [MIT License](LICENSE)를 따릅니다. 기존 개별 고지가 있거나 외부에서 가져온 자료에는 MIT를 덮어씌우지 않습니다. 패키지 의존성은 각 패키지의 라이선스를 따릅니다.

특히 `data/`와 `public/demo/`의 도해·모델·용어·참고 데이터·이미지는 일괄 MIT 적용 대상이 아닙니다. 도해는 CC BY·CC BY-SA 조건을, 명칭 사전은 원천 공공데이터 이용조건을 유지합니다. 미확인 PDF·지침 출처의 명칭과 복제된 위치 설명은 제외했습니다. [외부 자료 고지와 원천 조건](THIRD_PARTY_NOTICES.md)을 확인하세요. 이번 출처별 점검은 모든 권리를 법률적으로 보증하거나 전체 자산에 MIT만 적용한다는 뜻이 아닙니다.

[언어 선택으로 돌아가기](#hanisoap)
