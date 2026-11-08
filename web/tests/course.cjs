const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=require('path').resolve(__dirname,'..');
function environment(storage={}){
 const nodes=new Map(),dataElements=[],nav=[];let uid=0;const values={...storage};
 class Element{constructor(id=''){this.id=id;this.value='';this.textContent='';this.dataset={};this.disabled=false;this._html='';this.attrs={};this.classList={toggle(){},add(){},remove(){},contains(){return false}}}setAttribute(k,v){this.attrs[k]=v}append(e){if(e.id)nodes.set(e.id,e)}remove(){}click(){this.onclick?.()}scrollIntoView(){}set innerHTML(html){for(let i=dataElements.length-1;i>=0;i--)if(dataElements[i]._container===this)dataElements.splice(i,1);if(this.id==='main'){for(const key of nodes.keys())if(!['main','xp','global-status'].includes(key))nodes.delete(key);dataElements.length=0}this._html=html;for(const tag of html.matchAll(/<\w+\b([^>]*)>/g)){const attrs={};for(const m of tag[1].matchAll(/([\w-]+)="([^"]*)"/g))attrs[m[1]]=m[2];if(!attrs.id&&!Object.keys(attrs).some(k=>k.startsWith('data-')))continue;const e=new Element(attrs.id||'anon'+uid++);e._container=this;e.value=attrs.value||'';for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))e.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;if(attrs.id)nodes.set(attrs.id,e);if(Object.keys(e.dataset).length)dataElements.push(e)}}get innerHTML(){return this._html}}
 for(const id of ['main','xp','global-status'])nodes.set(id,new Element(id));for(const page of ['course','review','video','settings']){const b=new Element();b.dataset.page=page;nav.push(b)}
 const doc={body:new Element(),createElement:()=>new Element(),querySelector:s=>s[0]==='#'?nodes.get(s.slice(1))||null:null,querySelectorAll:s=>{if(s==='nav button'||s==='[data-page]')return nav;const m=s.match(/^\[data-([\w-]+)\]$/);if(m){const key=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return dataElements.filter(e=>key in e.dataset)}return []}};
 let utterances=[],recognized=[];class SR{constructor(){recognized.push(this)}start(){this.onstart?.()}stop(){this.onend?.()}abort(){this.onend?.()}}
 let permissionResolve;const win={scrollTo(){},addEventListener(){},SpeechRecognition:SR,speechSynthesis:{cancel(){},getVoices:()=>[{voiceURI:'test-us',name:'Test US',lang:'en-US',localService:true},{voiceURI:'test-ru',name:'Test RU',lang:'ru-RU',localService:true}],addEventListener(){},speak:u=>utterances.push(u)}};
 const context={document:doc,window:win,navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{permissionResolve=()=>resolve({getTracks:()=>[{stop(){}}]})})}},localStorage:{getItem:k=>values[k]??null,setItem:(k,v)=>values[k]=v},SpeechSynthesisUtterance:class{constructor(text){this.text=text}},URL,Blob,TextEncoder,AbortController,setTimeout,console,confirm:()=>true};vm.createContext(context);vm.runInContext(fs.readFileSync(root+'/curriculum.js','utf8')+fs.readFileSync(root+'/app.js','utf8'),context);return {context,doc,values,utterances,recognized,allow:()=>permissionResolve()};
}
const env=environment();const ctx=env.context;ctx.assert=assert;
vm.runInContext(`
assert.equal(COURSE.units.length,84);assert.equal(COURSE.modules.length,12);
assert.equal(document.querySelectorAll('[data-unit]').length,252);
for(const u of COURSE.units){assert(u.rule.length>100);assert(u.pattern.length>4);assert.equal(u.examples.length,3);for(const e of u.examples){assert(e[0].split(' ').some(word=>norm(word)===norm(e[2])),'Gap missing in '+u.id+': '+e[0]);}}
for(let id=1;id<=84;id++){
 openLesson(id,0);assert($('#main').innerHTML.includes(h(unitById(id).rule)));assert($('#read-rule'));$('#mark-read').onclick();
 for(const phase of [1,2]){
  openLesson(id,phase);
  for(let index=0;index<6;index++){
   assert.equal(run.index,index);const task=run.tasks[index];
   if(['translate','gap','listen'].includes(task.type)){task.choice=task.options.indexOf(task.answer);assert.equal(task.options.length,3);assert.equal(new Set(task.options).size,3)}
   else if(task.type==='tiles'){let used=new Set();task.selected=task.en.split(' ').map(w=>{const n=task.tiles.findIndex((v,i)=>v===w&&!used.has(i));used.add(n);return n})}
   else task.typed=task.answer;
   exercise();assert.equal($('#check').disabled,false);$('#check').onclick();assert(task.checked);assert(task.correct,'Evaluation failed '+id+'/'+phase+'/'+task.type);$('#check').onclick();
  }
  assert.equal(state.completed[lessonKey(id,phase)].correct,6);
 }
}
assert.equal(completedCount(),252);assert.equal(state.xp,84*(5+17+17));
const before=state.xp;openLesson(1,0);$('#mark-read').onclick();openLesson(1,1);$('#repeat').onclick();for(let i=0;i<6;i++){const task=run.tasks[i];if(['translate','gap','listen'].includes(task.type))task.choice=task.options.indexOf(task.answer);else if(task.type==='tiles'){const used=new Set();task.selected=task.en.split(' ').map(w=>{const n=task.tiles.findIndex((v,j)=>v===w&&!used.has(j));used.add(n);return n})}else task.typed=task.answer;exercise();$('#check').onclick();$('#check').onclick()}assert.equal(state.xp,before,'Repeated lessons grant XP');
// Errors must enter the review queue and leave it after a correct answer.
state.runs['2:1']=newRun(2,1);openLesson(2,1);const wrong=run.tasks[0];wrong.choice=(wrong.options.indexOf(wrong.answer)+1)%3;exercise();$('#check').onclick();assert(state.mistakes[taskKey(wrong)]);setPage('review');$('#start-review').onclick();const fixing=run.tasks[0];fixing.choice=fixing.options.indexOf(fixing.answer);exercise();$('#check').onclick();assert(!state.mistakes[taskKey(fixing)]);$('#check').onclick();assert($('#main').innerHTML.includes('Повторение завершено'));
// Exercises that require unavailable speech can be skipped, without blocking progress.
state.runs['3:2']=newRun(3,2);state.runs['3:2'].index=5;openLesson(3,2);$('#skip').onclick();assert.equal(state.completed['3:2'].skipped,1);
setPage('course');state.query='nothing-matches-this';topicList();assert($('#course-topics').innerHTML.includes('Таких тем'));state.query='';state.level='A1';topicList();assert.equal(document.querySelectorAll('[data-unit]').length,84);
assert(parseVideo('https://www.ted.com/talks/test_talk/transcript').embed.startsWith('https://embed.ted.com/'));assert(parseVideo('https://youtu.be/abcdefghijk').embed.includes('youtube-nocookie'));
for(const bad of ['javascript:alert(1)','https://ted.com.evil.com/talks/test','https://example.com/video'])assert.throws(()=>parseVideo(bad));
const restored=cleanState(JSON.parse(JSON.stringify(state)));assert(validState(restored));assert.equal(Object.keys(restored.completed).length,252);const unsafe=JSON.parse(JSON.stringify(state));unsafe.videos=[{url:'javascript:bad()'}];unsafe.query={};const safe=cleanState(unsafe);assert.equal(safe.videos.length,0);assert.equal(safe.query,'');
setPage('video');setPage('settings');assert($('#voice-en').innerHTML.includes('Test US'));$('#read-rule');
for(const u of COURSE.units)assert(u.detail.usage&&u.detail.spelling&&u.detail.exceptions&&u.detail.questions);
assert(answerFromCourse(COURSE.units[3],'какие исключения?').includes('my book'));
const cues=parseCaptions('1\\n00:00:01,000 --> 00:00:02,000\\nHello!\\n\\n2\\n00:00:03,000 --> 00:00:04,000\\nWorld');assert.equal(cues.length,2);assert.equal(cues[0].start,1);assert.equal(cues[1].en,'World');for(const chunk of splitForTranslation('Ж'.repeat(600)))assert(new TextEncoder().encode(chunk).length<=450);
const newer=JSON.parse(JSON.stringify(state));newer.theme='dark';newer.videoVoice={uri:'ru',rate:1};const newerRestored=cleanState(newer);assert.equal(newerRestored.theme,'dark');assert.equal(newerRestored.videoVoice.rate,1);
console.log('PASS: 84 explanations, 252 accessible lessons, 1008 task answers, completion/XP, error review, skipping, search/level filters, URL safety and backup restore.');
`,ctx);
const migrated=environment({et3:JSON.stringify({day:7,done:{1:8,2:10},game:{xp:30},voice:{rate:.85}})});migrated.context.assert=assert;vm.runInContext("assert.equal(state.current.id,7);assert.equal(state.xp,30);assert(state.completed['1:1']);assert.equal(completedCount(),2)",migrated.context);
(async()=>{const e=environment();const c=e.context;c.assert=assert;vm.runInContext("openLesson(4,1);globalThis.pending=record(t=>{globalThis.transcript=t});",c);e.allow();await c.pending;let r=e.recognized.at(-1);r.onresult({results:[[{transcript:'test phrase'}]]});r.onend();assert.equal(c.transcript,'test phrase');vm.runInContext("globalThis.pending=record(()=>{});setPage('settings');",c);e.allow();await c.pending;assert.equal(e.recognized.length,1,'permission resolving after navigation starts recording');vm.runInContext("state.voice.voiceURI='test-us';state.voice.rate=.65;speak('Hello');",c);assert.equal(e.utterances.at(-1).voice.voiceURI,'test-us');assert.equal(e.utterances.at(-1).rate,.65);console.log('PASS: native-compatible speech callbacks, voice selection and permission/navigation race.');})().catch(e=>{console.error(e);process.exitCode=1});

(async()=>{const e=environment(),c=e.context;c.fetch=async()=>({ok:true,json:async()=>({responseStatus:200,responseData:{translatedText:'Привет'}})});vm.runInContext("globalThis.v={cues:[{start:0,end:1,en:'Hello',ru:''}]};globalThis.p=translateCaptions(v)",c);await c.p;assert.equal(c.v.cues[0].ru,'Привет');c.fetch=async()=>({ok:true,json:async()=>({responseStatus:429,quotaFinished:true})});vm.runInContext("globalThis.v={cues:[{start:0,end:1,en:'Hello',ru:'готово'},{start:1,end:2,en:'New text',ru:''}]};globalThis.p=translateCaptions(v)",c);await c.p;assert.equal(c.v.cues[0].ru,'готово');assert.equal(c.v.cues[1].ru,'');console.log('PASS: subtitle translation response, quota handling and retention of completed translations.');})().catch(error=>{console.error(error);process.exitCode=1});
