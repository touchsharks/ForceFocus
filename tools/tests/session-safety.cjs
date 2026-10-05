const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('app/src/main/assets/ui/focus.js','utf8');
const fn=source.slice(source.indexOf('    function restoreSession()'),source.indexOf('    function startFocus('));
function run(native,value,throws=false){
 let removed=false,shown=null;
 const c={window:{NativeBridge:native?{restoreFocusSession(){}}:undefined},LOCAL_SESSION_KEY:'session',
 bridgeCall(){if(throws)throw Error('bridge unavailable');return value;},
 parseStoredSession:v=>v?JSON.parse(v):null,localStorage:{getItem:()=>'{"task":"old"}',removeItem(){removed=true;}},showFocus:v=>shown=v};
 vm.createContext(c);vm.runInContext(fn+'\nrestoreSession();',c);return {removed,shown};
}
assert.deepEqual(run(true,''),{removed:true,shown:null});
assert.deepEqual(run(true,'',true),{removed:true,shown:null});
assert.equal(run(true,'{"task":"native"}').shown.task,'native');
assert.equal(run(false,'').shown.task,'old');
console.log('PASS: cancelled native sessions cannot be resurrected by WebView cache; valid native and browser preview restore.');
