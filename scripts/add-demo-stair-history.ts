import { mkdir,writeFile } from 'node:fs/promises';
import { readState,updateState } from '../src/lib/server/store';
import { addDemoStairHistory } from '../src/lib/demo/stair-history';
(async()=>{
 const before=await readState();const dry=structuredClone(before.state);const proposed=addDemoStairHistory(dry);
 if(!proposed.length){console.log(JSON.stringify({added:0,reused:true,storage:before.storage}));return;}
 await mkdir('.hani-local',{recursive:true});
 await writeFile(`.hani-local/stair-history-before-${before.version}.json`,JSON.stringify(before),{mode:0o600});
 let added:string[]=[],baseline=before.state;const after=await updateState(state=>{baseline=structuredClone(state);added=addDemoStairHistory(state);});
 const rows=after.state.observations.filter(row=>added.includes(row.id));
 const unchanged=['transcripts','soap_documents','care_messages','treatments','annotations'].every(key=>JSON.stringify(baseline[key as keyof typeof baseline])===JSON.stringify(after.state[key as keyof typeof after.state]));
 if(!unchanged)throw new Error('UNRELATED_STATE_CHANGED');
 console.log(JSON.stringify({storage:after.storage,added:added.length,version:after.version,scores:rows.map(row=>row.value),origin:'synthetic_history',unrelatedStatePreserved:unchanged}));
})().catch(error=>{console.error(error instanceof Error?error.name:'SEED_FAILED');process.exitCode=1;});
