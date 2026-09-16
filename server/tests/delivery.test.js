import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../app.js';
import {jobs,persistCompletedJob,restoreCompletedJobs} from '../services/downloadService.js';
import {jobDirectory,removeJobFiles} from '../services/cleanupService.js';

test('completed download survives restart; HEAD preserves it; full delivery removes it',async()=>{
  const id=randomUUID(),dir=jobDirectory(id);
  const data=Buffer.alloc(8*1024*1024,0x53);
  await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'media.mp4');await fs.writeFile(file,data);
  const job={id,file,filename:'Saved-video.mp4',state:'completed',progress:100,createdAt:Date.now(),finishedAt:Date.now(),listeners:new Set()};
  jobs.set(id,job);await persistCompletedJob(job);
  // Simulate loss of the in-memory queue when the Node server restarts.
  jobs.delete(id);await restoreCompletedJobs();
  assert.equal(jobs.get(id).state,'completed');
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/api/download/${id}/file`;
  try {
    for(let i=0;i<2;i++) {
      const response=await fetch(url,{method:'HEAD'});assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(data.length));
      assert.equal(jobs.get(id).state,'completed');assert.ok(await fs.stat(file));
    }
    const response=await fetch(url,{headers:{Range:'bytes=0-1023'}});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const received=Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(received).digest('hex'),createHash('sha256').update(data).digest('hex'));
    for(let i=0;i<30;i++){if(!(await fs.stat(dir).catch(()=>null)))break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(await fs.stat(dir).catch(()=>null),null);assert.equal(jobs.get(id).state,'delivered');
    assert.equal((await fetch(url)).status,409);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));jobs.delete(id);await removeJobFiles(id);}
});

test('recovery ignores a manifest that points outside the job directory',async()=>{
  const id=randomUUID(),dir=jobDirectory(id);await fs.mkdir(dir,{recursive:true});
  try {
    await fs.writeFile(path.join(dir,'job.json'),JSON.stringify({file:'../../package.json',filename:'video.mp4',finishedAt:Date.now()}));
    await restoreCompletedJobs();assert.equal(jobs.has(id),false);
  } finally {await removeJobFiles(id);}
});
