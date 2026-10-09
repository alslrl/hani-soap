import { expect, it } from 'vitest';
import { cropAudio, normalizeAudio } from './crop';
function wave() {
  const rate=16000, size=rate*2, bytes=Buffer.alloc(44+size);
  bytes.write('RIFF');bytes.writeUInt32LE(36+size,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(size,40);
  for(let i=0;i<rate;i++)bytes.writeInt16LE(Math.round(1000*Math.sin(i*2*Math.PI*440/rate)),44+i*2);
  return new Blob([bytes],{type:'audio/wav'});
}
it('normalizes real PCM, strips metadata and crops a bounded playable WAV',async()=>{
 const normalized=await normalizeAudio(wave());expect(normalized.type).toBe('audio/flac');expect(Buffer.from(await normalized.arrayBuffer()).subarray(0,4).toString()).toBe('fLaC');
 const clip=await cropAudio(normalized,100,600);expect(clip.type).toBe('audio/wav');expect(Buffer.from(await clip.arrayBuffer()).subarray(0,4).toString()).toBe('RIFF');
 await expect(cropAudio(wave(),-1,100)).rejects.toThrow('AUDIO_CROP_RANGE');
 await expect(cropAudio(wave(),0,31000)).rejects.toThrow('AUDIO_CROP_RANGE');
});
