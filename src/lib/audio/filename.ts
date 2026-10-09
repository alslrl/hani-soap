/** Safe both in the browser and server. The original basename never enters the API request. */
export function privateAudioFilename(original: string, id = globalThis.crypto.randomUUID()) {
  const extension = original.match(/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|flac)$/i)?.[1].toLowerCase();
  if (!extension) throw new Error('AUDIO_FORMAT_UNSUPPORTED');
  if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error('INVALID_RECORDING');
  return `audio-${id}.${extension}`;
}
