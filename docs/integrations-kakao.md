# 카카오 본인 발송

발표자 본인의 카카오톡 ‘나와의 채팅’에 승인한 가상 환자 안내를 보낸다. 실제 환자의 카카오 계정을 연결하거나 친구·알림톡으로 발송하는 기능은 포함하지 않는다.

## 설정과 사용

기존 카카오 앱 `HaniSOAP 데모`(ID `1602111`)를 사용한다. 카카오 로그인은 활성화되어 있고 `talk_message`는 선택 동의로 등록되어 있다. 연결 과정에서 사용자가 이 항목에 동의해야 한다.

등록한 운영 웹 도메인은 `https://hani-soap.vercel.app`, 로그인 Redirect URI는 `https://hani-soap.vercel.app/api/auth/kakao/callback`이다. 기존 localhost 도메인과 Redirect URI도 유지한다.

서버 환경변수는 `KAKAO_APP_ID`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_TOKEN_ENCRYPTION_KEY`, `APP_ORIGIN`이다. 실제 키는 `.env.local`과 Vercel Production 환경에만 저장한다. 토큰 암호화 키는 임의의 32바이트를 64자리 hex로 표현한 값이다.

설정 → 카카오로 연결 → 메시지 전송 동의 → 후속 관리에서 문안 검토·승인 → 승인 문안 나에게 보내기 순서로 사용한다. 모의 발송 버튼은 별도로 유지한다.

## 전송과 응답

텍스트 템플릿의 200자 한도에 맞춰 전송 미리보기를 표시한다. 긴 문안을 조용히 바꾸거나 재요약하지 않는다. 카카오 메시지에는 미리보기와 전체 안내 링크를 보내고, 링크 화면에서 승인 문안 전체를 그대로 보여준다.

안내 단계별로 최대 두 개의 링크 버튼을 제공한다. 전체 안내 화면에서는 단계에 허용된 모든 응답을 선택할 수 있다. 링크 GET과 카카오 미리보기 조회는 응답을 저장하지 않는다. 사용자가 ‘응답 전달’을 누른 POST만 기록하며, `kakao_self_link` 출처를 표시한다. 불편 응답은 연락 작업을 만들고, 같은 응답의 재요청·상세 보완은 연락 작업을 중복 생성하지 않는다.

## 서버 처리

PIN 세션은 기존 `SameSite=Strict` 쿠키를 유지한다. OAuth만 별도 HttpOnly·Lax 쿠키와 10분짜리 일회용 state를 사용한다. 콜백은 원래 PIN 세션의 유효성도 확인한다. 토큰은 서버에서 교환하고, AES-256-GCM으로 암호화해 별도의 `kakao_private_state`에 보관한다. 이 테이블은 RLS를 적용하고 브라우저 역할의 권한을 취소했다. 토큰·state·응답 토큰 해시는 `/api/state`에 포함되지 않는다.

발송은 같은 메시지 ID와 승인 문안 해시를 기준으로 원자적으로 선점한다. 카카오 API가 `result_code: 0`을 돌려줄 때만 전송 성공으로 기록한다. 명시적인 거절은 failed, 타임아웃·불명확한 응답은 unknown으로 남긴다. unknown은 자동·수동 재시도를 차단한다. failed만 사용자가 다시 시도할 수 있다. 카카오 API의 성공 응답은 API 접수 증거이며, 휴대폰에서 실제로 메시지를 보았다는 증거와 구분한다.

응답 링크는 임의의 32바이트 토큰으로 만들고 해시만 저장한다. 유효기간은 7일이며, 메시지·승인 해시·허용 응답에 묶는다.

## 검증

- 카카오 서버 테스트 9개: state 위조·재사용, PIN 해제, 암호화 변조, 승인 문안 대조, 동시 발송, 타임아웃, 명시적 거절·재시도, 토큰 갱신, GET/POST 분리, 응답 중복, Origin·PIN 보호.
- 격리 PostgreSQL 검사 33개: 새 서버 전용 테이블의 접근 거절과 버전 비교를 포함한다.
- 브라우저 전체 흐름 테스트 1개 통과: 연결 → 승인 문안 발송 → 중복 재요청 차단 → 전체 안내 GET → POST 응답·상세 보완 → 연락 작업 1개 생성. 로컬 저장소와 명시적으로 사전 로드한 가짜 카카오 제공자에서 수행했다. 운영에 가짜 제공자나 전송 우회 설정을 추가하지 않는다.
- 운영 OAuth·카카오 API 응답·휴대폰 수신 확인은 각각 확인된 단계만 보고한다.

출처: [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [카카오톡 메시지 REST API](https://developers.kakao.com/docs/ko/kakaotalk-message/rest-api), [텍스트 템플릿](https://developers.kakao.com/docs/ko/message-template/default#text).
