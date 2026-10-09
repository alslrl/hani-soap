import { describe,expect,it,vi } from 'vitest';
import { AppError } from '@/lib/server/errors';
import { audioFailure,encodeAudioFailure } from './processing-error';
const mocks=vi.hoisted(()=>({transcribe:vi.fn(),correct:vi.fn(),soap:vi.fn(),fail:vi.fn()}));
vi.mock('@/lib/ai/pipeline',()=>({transcribeStep:mocks.transcribe,correctionStep:mocks.correct,soapStep:mocks.soap,failJob:mocks.fail}));
import { processAudioWorkflow } from '../../../workflows/process-audio';
describe('audio errors through Workflow boundaries',()=>{
 it('preserves empty speech and its actual failure stage after Error serialization',()=>{
  const encoded=encodeAudioFailure(new AppError(422,'TRANSCRIPTION_EMPTY','본문 전사 결과가 비어 있습니다.'),'transcribing');
  expect(audioFailure(new Error(encoded))).toMatchObject({code:'TRANSCRIPTION_EMPTY',stage:'transcribing',retryable:false});
  expect(audioFailure(new Error(encoded)).message).toContain('음성이 감지되지');
 });
 it('keeps provider input private and does not accept arbitrary messages in a forged envelope',()=>{
  const privateText='private patient request and secret';
  expect(encodeAudioFailure(new Error(privateText),'soap_draft')).not.toContain(privateText);
  const serialized='HANI_AUDIO_FAILURE_V1:'+JSON.stringify({code:'TRANSCRIPTION_EMPTY',stage:'transcribing',message:privateText});
  expect(audioFailure(new Error(serialized)).message).not.toContain(privateText);
  expect(audioFailure(new Error('HANI_AUDIO_FAILURE_V1:{"code":"invented","stage":"anything"}')).code).toBe('AUDIO_PROCESSING_FAILED');
 });
 it('ends a silent audio workflow without correction/SOAP and persists the recognizable cause',async()=>{
  mocks.transcribe.mockRejectedValue(new AppError(422,'TRANSCRIPTION_EMPTY','빈 전사'));mocks.correct.mockReset();mocks.soap.mockReset();mocks.fail.mockReset();
  await expect(processAudioWorkflow('job')).rejects.toThrow('TRANSCRIPTION_EMPTY');
  expect(mocks.correct).not.toHaveBeenCalled();expect(mocks.soap).not.toHaveBeenCalled();
  expect(audioFailure(mocks.fail.mock.calls[0][1])).toMatchObject({code:'TRANSCRIPTION_EMPTY',stage:'transcribing'});
 });
});
