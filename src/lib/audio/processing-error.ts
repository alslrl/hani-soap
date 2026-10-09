import { AppError } from '@/lib/server/errors';
const prefix='HANI_AUDIO_FAILURE_V1:';
const messages={
 TRANSCRIPTION_EMPTY:'음성이 감지되지 않았어요. 말한 내용이 포함된 녹음을 다시 보내 주세요.',
 TRANSCRIPTION_RETRYABLE:'전사 서비스가 일시적으로 응답하지 않았어요. 저장된 음성으로 다시 시도할 수 있어요.',
 TRANSCRIPTION_REJECTED:'전사 요청을 처리하지 못했어요. 음성 형식과 전사 모델 연결을 확인해 주세요.',
 RECORDING_NOT_FOUND:'저장한 음성을 찾지 못했어요. 녹음 복구본이나 파일을 확인해 주세요.',
 AUDIO_NOT_FOUND:'저장한 음성 파일을 읽지 못했어요. 녹음 복구본이나 파일을 확인해 주세요.',
 SOAP_EVIDENCE_INVALID:'진료 기록 초안의 인용 근거가 맞지 않아 생성을 중단했어요. 전사를 확인한 뒤 다시 생성해 주세요.',
 SOAP_SOURCE_SECTION_INVALID:'진료 기록 초안의 출처 구분이 맞지 않아 생성을 중단했어요. 확인한 기록을 대조해 주세요.',
 SOAP_SECTION_WITHOUT_EVIDENCE:'진료 기록 초안에 근거 없는 내용이 있어 생성을 중단했어요. 다시 생성해 주세요.',
 SOAP_NUMBER_UNSUPPORTED:'진료 기록 초안에 근거 없는 수치가 있어 생성을 중단했어요. 다시 생성해 주세요.',
 AI_RATE_LIMIT:'AI 요청 한도에 도달했어요. 잠시 후 저장된 음성으로 다시 시도해 주세요.',
 AI_SERVICE_UNAVAILABLE:'AI 서비스 연결이 일시적으로 끊겼어요. 잠시 후 다시 시도해 주세요.',
 AUDIO_PROCESSING_FAILED:'음성 처리를 완료하지 못했어요. 해당 단계에서 다시 시도해 주세요.',
} as const;
export type AudioFailure={code:keyof typeof messages;stage:string;retryable:boolean;message:string};
const stages=['queued','transcribing','alignment_review','speaker_roles','dictionary_correction','soap_draft'];
const known=(code:unknown):code is keyof typeof messages=>typeof code==='string' && Object.hasOwn(messages,code);
/** Only known error codes cross Workflow serialization; provider input/bodies stay private. */
export function audioFailure(error:unknown,stage='transcribing'):AudioFailure {
 const text=error instanceof Error ? error.message : '';
 if(text.startsWith(prefix)) {
  try {const item=JSON.parse(text.slice(prefix.length));if(known(item.code)&&stages.includes(item.stage))return failure(item.code,item.stage);}catch{}
 }
 const status=error && typeof error==='object' && 'statusCode' in error ? Number(error.statusCode) : null;
 const code=error instanceof AppError && known(error.code) ? error.code : known(text) ? text : status===429 ? 'AI_RATE_LIMIT' : status && status>=500 ? 'AI_SERVICE_UNAVAILABLE' : 'AUDIO_PROCESSING_FAILED';
 return failure(code,stages.includes(stage)?stage:'transcribing');
}
function failure(code:AudioFailure['code'],stage:string):AudioFailure {
 return {code,stage,message:messages[code],retryable:!['TRANSCRIPTION_EMPTY','RECORDING_NOT_FOUND','AUDIO_NOT_FOUND'].includes(code)};
}
export function encodeAudioFailure(error:unknown,stage:string) {const item=audioFailure(error,stage);return prefix+JSON.stringify({code:item.code,stage:item.stage});}
