import { afterEach, expect, it, vi } from 'vitest';
import { transcribeContentAudio } from './transcribe';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses the requested content model, Korean hint and opaque filename without script or expected-answer hints',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test-only-no-network');
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  const form=init.body as FormData;
  expect(form.get('model')).toBe('gpt-transcribe'); expect(form.getAll('languages[]')).toEqual(['ko']);
  expect(form.has('prompt')).toBe(false); expect(form.has('keywords[]')).toBe(false); expect(form.has('language')).toBe(false);
  expect((form.get('file') as File).name).toMatch(/^audio-[a-f\d-]{36}\.wav$/);
  return Response.json({text:'  김서연입니다. 발을 높여 주세요.\n',languages:[{code:'ko'}]});
 }));
 expect(await transcribeContentAudio(new Blob(['fake']),'김서연.wav')).toEqual({text:'  김서연입니다. 발을 높여 주세요.\n',model:'gpt-transcribe'});
});
it('rejects empty content and labels temporary provider errors for retry',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test-only-no-network');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({text:' '})));
 await expect(transcribeContentAudio(new Blob(['fake']),'demo.wav')).rejects.toMatchObject({code:'TRANSCRIPTION_EMPTY'});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:429})));
 await expect(transcribeContentAudio(new Blob(['fake']),'demo.wav')).rejects.toMatchObject({code:'TRANSCRIPTION_RETRYABLE'});
});
