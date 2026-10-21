# Browser integration checks / 브라우저 통합 검증

[English](#english) | [한국어](#한국어)

## English

These tests check PIN entry, protected APIs, separation of visit and record states, iPad procedure records, and follow-up contact workflows against a running local app. They do not modify the original seed JSON or cloud database. They neither start the server nor reset stored data automatically.

### Start an isolated local app

In a separate terminal, start the app with a new temporary directory as `HANI_DATA_DIR`. Set `HANI_STORAGE_MODE=local` to use temporary local storage even when Supabase is configured, and set `OPENAI_API_KEY` to an empty value to block external model requests. The tests modify visit data only after checking for `storage: local` and a localhost address.

```sh
HANI_STORAGE_MODE=local OPENAI_API_KEY='' HANI_DATA_DIR="$(mktemp -d /tmp/hani-e2e.XXXXXX)" npm run dev
```

### Install the browser and run checks

```sh
npx playwright install chromium
npm run test:e2e
```

The default address is `http://127.0.0.1:3000` and the development PIN is `1234`. Use `PLAYWRIGHT_BASE_URL` for a different local port and `HANI_TEST_PIN` for a different development PIN. On failure, inspect screenshots and traces in `test-results` and the HTML report in `playwright-report`. Tests use one worker because they share stored state. Use a new temporary storage directory for repeat runs.

### Verification boundaries

Actual external microphones, iPad Safari, OpenAI transcription quality, Kakao sending, and Vercel/Supabase deployments require separate checks on real devices or in environments with the necessary credentials. Passing these browser tests alone does not verify those integrations. These instructions do not assert that the tests or real-device checks have been completed.

## 한국어

이 테스트는 실행 중인 로컬 앱에서 PIN 입력, 보호된 API, 진료·기록 상태 분리, iPad 시술 기록과 후속 연락을 검사합니다. 원본 seed JSON과 클라우드 DB는 수정하지 않습니다. 서버를 자동으로 시작하거나 저장 데이터를 자동으로 초기화하지 않습니다.

### 격리된 로컬 앱 실행

별도 터미널에서 새 임시 디렉터리를 `HANI_DATA_DIR`로 지정해 앱을 실행합니다. `HANI_STORAGE_MODE=local`로 Supabase 설정이 있어도 임시 로컬 저장소를 사용하고, `OPENAI_API_KEY`를 빈 값으로 지정해 외부 모델 요청을 차단합니다. 테스트는 `storage: local`과 localhost 주소를 확인한 뒤에만 진료 데이터를 변경합니다.

```sh
HANI_STORAGE_MODE=local OPENAI_API_KEY='' HANI_DATA_DIR="$(mktemp -d /tmp/hani-e2e.XXXXXX)" npm run dev
```

### 브라우저 설치와 검증 실행

```sh
npx playwright install chromium
npm run test:e2e
```

기본 주소는 `http://127.0.0.1:3000`이며, 개발 PIN은 `1234`입니다. 다른 로컬 포트는 `PLAYWRIGHT_BASE_URL`로 지정하고, 개발 PIN을 변경했다면 `HANI_TEST_PIN`으로 지정합니다. 실패 시 `test-results`의 스크린샷·trace와 `playwright-report`의 HTML 보고서를 확인합니다. 공유 저장 상태를 다루므로 워커는 한 개입니다. 반복 실행 시에는 새로운 임시 저장 디렉터리를 사용하세요.

### 검증 범위와 한계

실제 외부 마이크·iPad Safari·OpenAI 전사 품질·Kakao 발송·Vercel/Supabase 배포는 별도 실제 장치 또는 필요한 인증정보가 있는 환경에서 확인해야 합니다. 이 브라우저 테스트의 통과만으로 해당 연결을 검증했다고 간주하지 않습니다. 이 안내는 테스트나 실기기 검증이 완료됐다는 주장이 아닙니다.
