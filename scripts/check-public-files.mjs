import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Only inspect Git-tracked files. Never print a matched credential or patient text.
const privatePaths = [
  /^data\/변증명_PDF(?:추출|파일별)\.txt$/,
  /^(?:output|docs\/(?:audio|transcripts|codex-logs|notion))\//i,
  /^docs\/reference\/(?:sigmachart\/|DevDay_Seoul_Participant_Guide\.)/i,
  /^docs\/(?:manifest\.json|README\.txt|presentation-plan\.md|asr-refinement\.md)$/i,
  /^docs\/verification\/(?:audio-progress-ui\.md|데모_정답차팅_초안\.md)$/i,
  /(?:^|\/)(?:\.env(?:\..+)?|\.hani-local|\.hani-data|\.vercel|node_modules)(?:\/|$)/i,
  /\.(?:zip|pdf|mp3|m4a|wav|mp4|mov|sqlite|db)$/i,
  /(?:^|\/)(?:test-results|playwright-report)\//i,
];
const secretPatterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['openai-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{30,}/],
  ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}/],
  ['jwt-literal', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
];
const blocked = (file) => file !== '.env.example' && privatePaths.some((r) => r.test(file));

if (process.argv.includes('--self-test')) {
  for (const file of ['docs/codex-logs/session.zip','docs/audio/test.mp3','output/slides.pdf','.env.local','.hani-data/state.json','docs/reference/sigmachart/images/a.png']) assert.equal(blocked(file), true, file);
  for (const file of ['.env.example','src/app/page.tsx','public/demo/anatomy/source/LICENSE.txt','docs/maintenance.md']) assert.equal(blocked(file), false, file);
  assert.equal(secretPatterns.find(([name]) => name === 'openai-key')[1].test('sk-' + 'x'.repeat(30)), true);
  console.log('Public-file checker self-test passed.');
} else {
  const root = execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8',timeout:5000}).trim();
  const files = execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',timeout:5000}).split('\0').filter(Boolean);
  let findings = 0, textFiles = 0, binaryFiles = 0;
  for (const file of files) {
    if (blocked(file)) { console.error('BLOCKED_PATH: ' + file); findings++; continue; }
    const bytes = readFileSync(resolve(root,file));
    if (bytes.subarray(0,8192).includes(0) || /\.(?:png|jpe?g|webp|gif|glb|woff2?|ico)$/i.test(file)) { binaryFiles++; continue; }
    textFiles++;
    const text = bytes.toString('utf8');
    for (const [name, pattern] of secretPatterns) {
      const match = pattern.exec(text);
      if (match) { const line = text.slice(0,match.index).split('\n').length; console.error('POSSIBLE_SECRET ' + name + ': ' + file + ':' + line + ' [value hidden]'); findings++; }
    }
  }
  console.log(JSON.stringify({trackedFiles:files.length,textFiles,binaryFiles,findings,scope:'current tracked paths and known credential patterns only; not Git history, image contents, PHI, or license clearance'}));
  if (findings) process.exitCode = 1;
}
