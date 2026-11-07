(function(){
'use strict';
if(!window.EmmaNative)return;
let serial=0,voices=[],speakingId=null;const pending=new Map(),instances=new Map(),events=new EventTarget();
const id=()=>String(++serial);
function send(command,data={},requestId=id()){EmmaNative.postMessage(JSON.stringify({command,id:requestId,...data}));return requestId}
window.emmaNativeEvent=function(message){
 if(message.type==='permission'){const resolve=pending.get(message.id);if(resolve){pending.delete(message.id);resolve(message.granted)}return}
 if(message.type==='voices'){voices=message.voices||[];events.dispatchEvent(new Event('voiceschanged'));return}
 if(message.type==='voices-changed'){send('voices');return}
 const instance=instances.get(message.id);if(!instance)return;
 const handlers={'speech-start':'onstart','speech-end':'onend','speech-error':'onerror','recognition-start':'onstart','recognition-error':'onerror','recognition-end':'onend'};
 if(message.type==='recognition-result'){
  const alternative={transcript:message.text,confidence:0};const result=[alternative];result.isFinal=!!message.final;
  instance.onresult?.({results:[result],resultIndex:0});return;
 }
 if(message.type==='speech-end'||message.type==='speech-error'){if(speakingId===message.id)speakingId=null;instances.delete(message.id)}
 if(message.type==='recognition-end'){if(instance._id===message.id)instance._id=null;instances.delete(message.id)}
 instance[handlers[message.type]]?.({error:message.error||'',type:message.type});
};
window.emmaRequestMicrophone=function(){return new Promise(resolve=>{const request=id();pending.set(request,resolve);send('permission',{},request)})};
class NativeUtterance {constructor(text=''){this.text=text;this.lang='en-US';this.rate=1;this.pitch=1;this.volume=1;this.voice=null;}}
window.SpeechSynthesisUtterance=NativeUtterance;
const synthesis={getVoices:()=>voices,addEventListener:(...args)=>events.addEventListener(...args),removeEventListener:(...args)=>events.removeEventListener(...args),cancel(){send('cancel-speech');if(speakingId){instances.delete(speakingId);speakingId=null}},speak(utterance){this.cancel();const request=id();speakingId=request;instances.set(request,utterance);send('speak',{text:utterance.text,lang:utterance.lang,voiceURI:utterance.voice?.voiceURI||'',rate:utterance.rate,pitch:utterance.pitch,volume:utterance.volume},request)}};
Object.defineProperty(window,'speechSynthesis',{value:synthesis,configurable:true});
class NativeRecognition {
 constructor(){this.lang='en-US';this._id=null;}
 start(){if(this._id)throw Error('Recognition already started');this._id=id();instances.set(this._id,this);send('listen',{lang:this.lang},this._id)}
 stop(){if(this._id)send('stop-listen',{},this._id)}
 abort(){if(this._id){const previous=this._id;this._id=null;instances.delete(previous);send('abort-listen',{},previous);this.onend?.()}}
}
window.SpeechRecognition=NativeRecognition;window.webkitSpeechRecognition=NativeRecognition;
send('voices');
})();
