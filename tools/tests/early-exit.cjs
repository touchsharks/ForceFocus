const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('app/src/main/assets/ui/focus.js','utf8');
const functions=src.slice(src.indexOf('    function currentWeekKey('),src.indexOf('    function taskIdForSession('));
let now=new Date(2026,9,5,12).getTime(),native='',saved={};
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const ctx={Date:Clock,EARLY_EXIT_WEEK_KEY:'week',earlyExitLocked:false,localDateKey:v=>{const d=new Clock(v);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');},bridgeCall:(name,value)=>name==='getEarlyExitState'?native:(native=value),localStorage:{getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v},home:{classList:{toggle(){}}},branchHit:{setAttribute(){}}};
vm.createContext(ctx);vm.runInContext(functions,ctx);
assert.equal(ctx.currentWeekKey(),'2026-10-05');
ctx.recordEarlyExit();assert.equal(ctx.readEarlyExitState().earlyExitCount,1);assert.equal(ctx.earlyExitLocked,false);
ctx.recordEarlyExit();assert.equal(ctx.readEarlyExitState().earlyExitCount,2);assert.equal(ctx.earlyExitLocked,true);
now=new Date(2026,9,11,23,59,59).getTime();assert.equal(ctx.readEarlyExitState().earlyExitCount,2);
now=new Date(2026,9,12,0).getTime();assert.equal(ctx.readEarlyExitState().earlyExitCount,0);ctx.refreshEarlyExitLock();assert.equal(ctx.earlyExitLocked,false);
native='{}';saved.week=JSON.stringify({weekKey:'2026-10-12',earlyExitCount:2});assert.equal(ctx.readEarlyExitState().earlyExitCount,2);
assert(src.slice(src.indexOf('branchHit.addEventListener("pointerdown"')).includes('earlyExitLocked'));
console.log('PASS natural week rollover, two exits, native persistence, legacy mirror fallback');
