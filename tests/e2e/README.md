# 브라우저 통합 검증

이 테스트는 실행 중인 로컬 앱에서 PIN 입력, 보호된 API, 진료·기록 상태 분리,
iPad 시술 기록과 후속 연락을 검사한다. 원본 seed JSON과 클라우드 DB를 수정하지 않는다.
서버를 자동 시작하거나 저장 데이터를 자동 초기화하지 않는다.

별도 터미널에서 새 임시 디렉터리를 `HANI_DATA_DIR`로 지정해 앱을 실행한다.
Supabase 자격을 넣지 않은 로컬 환경을 사용한다. 테스트는 `storage: local`과
localhost 주소를 확인한 뒤에만 진료 데이터를 변경한다.

```sh
HANI_DATA_DIR="$(mktemp -d /tmp/hani-e2e.XXXXXX)" npm run dev
```

브라우저를 설치하고 검증한다.

```sh
npx playwright install chromium
npm run test:e2e
```

기본 주소는 `http://127.0.0.1:3000`, 개발 PIN은 `1234`다.
다른 로컬 포트는 `PLAYWRIGHT_BASE_URL`, 개발 PIN 변경은 `HANI_TEST_PIN`으로 지정한다.
실패 시 `test-results`의 스크린샷·trace와 `playwright-report` HTML을 확인한다.
공유 저장 상태를 다루므로 워커는 한 개이며, 반복 실행 시 새로운 임시 저장 디렉터리를 권장한다.

실제 외부 마이크·iPad Safari·OpenAI 전사 품질·Kakao 발송·Vercel/Supabase 배포는
별도 실제 장치 또는 자격이 있는 환경에서 확인해야 한다. 이 브라우저 테스트의 통과만으로
그 연결을 확인했다고 간주하지 않는다.
