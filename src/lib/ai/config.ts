export const AI_MODELS = {
  live: process.env.OPENAI_MODEL_LIVE || 'gpt-live-transcribe',
  transcription: process.env.OPENAI_MODEL_TEXT_TRANSCRIPTION || 'gpt-transcribe',
  diarization: process.env.OPENAI_MODEL_DIARIZATION || process.env.OPENAI_MODEL_TRANSCRIPTION || 'gpt-4o-transcribe-diarize',
  correction: process.env.OPENAI_MODEL_CORRECTION || 'gpt-6.1-sol',
  soap: process.env.OPENAI_MODEL_SOAP || 'gpt-6.1-sol',
  care: process.env.OPENAI_MODEL_CARE || 'gpt-6.1-sol',
  analysis: process.env.OPENAI_MODEL_ANALYSIS || 'gpt-6.1-sol',
  briefing: process.env.OPENAI_MODEL_BRIEFING || 'gpt-6.1-sol',
} as const;

export class AiConfigurationError extends Error {
  readonly code = 'AI_NOT_CONFIGURED';
  constructor() {
    super('서버에 OPENAI_API_KEY를 설정하면 실제 음성 전사와 AI 생성을 사용할 수 있습니다. 참고 자료 재생은 별도 데모입니다.');
  }
}

export function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiConfigurationError();
  return key;
}

export function aiConfiguration() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY),
    models: AI_MODELS,
    availability: 'not_verified' as const,
    maxFileBytes: 25_000_000,
    notice: '모델은 설정된 ID 그대로 호출합니다. 계정의 모델 접근 권한은 실제 호출 때 확인되며 자동으로 대체하지 않습니다.',
  };
}
