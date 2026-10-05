"use strict";
(()=>{
const KEY="forcefocus_work_items_v1",META_KEY="forcefocus_whitelist_apps_v1",APP_CACHE_KEY="forcefocus_installed_apps_cache_v1";
const LEGACY={wps:{id:"wps",name:"WPS"},xiaohongshu:{id:"xiaohongshu",name:"小红书"},fenbi:{id:"fenbi",name:"粉笔"},recorder:{id:"recorder",name:"录音机"}};
const DEFAULTS=[{id:"resume",slot:0,name:"简历",whitelist:["wps"]},{id:"job_research",slot:1,name:"岗位调研",whitelist:["wps","xiaohongshu"]},{id:"civil_service",slot:2,name:"考公",whitelist:["fenbi"]},{id:"listening",slot:3,name:"磨耳朵",whitelist:["recorder","wps"]}];
const EXCLUDED_LABELS=new Set(["biubiu加速器","keep","play商店","qq","uc浏览器","vivo官网","vivo健康","vivo摄影","一淘","一键锁屏","中国工商银行","中国建设银行","中国移动","中国移动云盘","主题","云·星穹铁道","云闪付","互传","京东","代号鸢","使用技巧","免费电子书","同程旅行","同城旅行","咪咕视频","天气","天猫","完美校园","对讲机","崩坏：星穹铁道","应用商店","意见反馈","手机管家","抖音","招商银行","拼多多","指南针","携程旅行","支付宝","新世界狂欢","日历","智慧生活","智能遥控","江西农商","浏览器","淘宝","百度地图","河马","米游社","绝区零","美团","美团外卖","联系人","蓝心小v","薄荷健康","解压专家","钱包","铁路12306","闲鱼","高德地图","鲨鱼记账"]);
const EXCLUDED_PACKAGES=new Set([
"com.tencent.mobileqq","com.android.vending","com.ucmobile","com.ss.android.ugc.aweme","com.eg.android.alipaygphone","com.taobao.taobao","com.jingdong.app.mall","com.xunmeng.pinduoduo","com.sankuai.meituan","com.sankuai.meituan.takeoutnew","com.autonavi.minimap","com.baidu.baidumap","com.MobileTicket","com.unionpay","com.unionpay.tsmservice","com.cmbchina.ccd.pluto.cmbActivity","cmb.pb","com.icbc","com.chinamworld.main","com.greenpoint.android.mc10086.activity","com.sinovatech.unicom.ui","com.tencent.androidqqmail","com.miui.weather2","com.android.contacts","com.android.calendar","com.android.browser","com.vivo.browser","com.vivo.weather","com.vivo.contacts","com.vivo.appstore","com.vivo.easyshare","com.vivo.smartmultiwindow","com.boohee.one"
].map(value=>value.toLowerCase()));
const $=s=>document.querySelector(s),home=$("#home"),drawer=$("#sidebarDrawer"),scrim=$("#sidebarScrim"),permissions=$("#sidebarPermissions"),workPanel=$("#sidebarWorkItems"),page=$("#whitelistPage"),pageList=$("#whitelistPageList"),picker=$("#installedAppPicker"),pickerList=$("#installedAppPickerList");
let items=readItems(),meta=readJson(META_KEY,{}),installedCache=readJson(APP_CACHE_KEY,[]),installedCacheWarm=false,pickerLoadToken=0,openSection=null,editingId=null,pickerItemId=null,pickerSlotIndex=null,activeUnbind=null,drawerSwipe=null,sidebarBarsTimer=0;
const tapTimers=new Map(),holdTimers=new Map();
function readJson(k,f){try{const v=JSON.parse(localStorage.getItem(k));return v&&typeof v==="object"?v:f}catch(e){return f}}
function normalize(values){const used=new Set();return values.slice(0,4).map((v,i)=>{let slot=Number(v.slot);if(!Number.isInteger(slot)||slot<0||slot>3||used.has(slot))slot=[0,1,2,3].find(x=>!used.has(x));used.add(slot);const whitelist=[null,null],seen=new Set();(Array.isArray(v.whitelist)?v.whitelist:[]).slice(0,2).forEach((value,index)=>{const id=value==null?"":String(value).trim();if(id&&!seen.has(id)){whitelist[index]=id;seen.add(id)}});return{id:String(v.id||`work_${Date.now()}_${i}`),slot,name:String(v.name||"未命名").trim().slice(0,24)||"未命名",whitelist}})}
function readItems(){try{const v=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(v)&&v.length>=1&&v.length<=4)return normalize(v)}catch(e){}return normalize(DEFAULTS)}
function clone(){return items.map(v=>({id:v.id,slot:v.slot,name:v.name,whitelist:[...v.whitelist]}))}
function save(){localStorage.setItem(KEY,JSON.stringify(items));window.dispatchEvent(new CustomEvent("forcefocus:workitemschange",{detail:clone()}))}
function saveMeta(){try{localStorage.setItem(META_KEY,JSON.stringify(meta))}catch(e){}}
function isExcludedBinding(id){if(!id)return false;const known=meta[id]||LEGACY[id]||{id,name:id};return isExcludedApp(known)}
function sanitizeBindings(){let changed=false;items.forEach(item=>item.whitelist.forEach((id,index)=>{if(id&&isExcludedBinding(id)){item.whitelist[index]=null;changed=true}}));if(changed)save();return changed}
function bridge(name,...args){try{if(window.NativeBridge&&typeof window.NativeBridge[name]==="function")return window.NativeBridge[name](...args)}catch(e){}return null}
function trace(name,started){try{console.info(`[ForceFocusPerf] ${name}: ${(performance.now()-started).toFixed(1)}ms`)}catch(e){}}
function normalizedLabel(value){return String(value||"").trim().replace(/\s+/g,"").toLowerCase()}
function appPackage(app){return String(app&&((app.packageName||app.package||app.id))||"").trim()}
function isExcludedApp(app){const packageName=appPackage(app).toLowerCase(),label=normalizedLabel(app&&app.name);return EXCLUDED_PACKAGES.has(packageName)||EXCLUDED_LABELS.has(label)}
function filterInstalled(values){const seen=new Set();return(Array.isArray(values)?values:[]).filter(app=>{if(!app||!app.id||!app.name||isExcludedApp(app))return false;const id=String(app.id);if(seen.has(id))return false;seen.add(id);return true})}
installedCache=filterInstalled(installedCache);
function metrics(v){const s=v||(window.getForceFocusMetrics&&window.getForceFocusMetrics())||{},d=Math.max(.1,Number(s.density)||devicePixelRatio||1),w=Math.max(1,Number(s.fullWidthPx)/d||innerWidth),h=Math.max(1,Number(s.fullHeightPx)/d||innerHeight);home.style.setProperty("--sidebar-mm-x",`${w/69}px`);home.style.setProperty("--sidebar-mm-y",`${h/155}px`);home.style.setProperty("--sidebar-mm-u",`${w/69}px`);home.style.setProperty("--sidebar-bg-offset-y",`${-(Number(s.statusInsetPx)||0)/d}px`)}
const isOpen=()=>home.classList.contains("sidebar-open"),isPage=()=>home.classList.contains("whitelist-page-open"),isPicker=()=>home.classList.contains("installed-app-picker-open");
function setSidebarSystemBars(visible){clearTimeout(sidebarBarsTimer);bridge("setSidebarSystemBarsVisible",Boolean(visible))}
function openDrawer(){if(home.classList.contains("focus-clock-active")||home.classList.contains("calendar-active"))return;const started=performance.now();setSidebarSystemBars(true);home.classList.add("sidebar-open");drawer.setAttribute("aria-hidden","false");scrim.setAttribute("aria-hidden","false");requestAnimationFrame(()=>{trace("sidebar first frame",started);setTimeout(refreshPermissions,0)})}
function closeDrawer(){editingId=null;activeUnbind=null;setSidebarSystemBars(false);home.classList.remove("sidebar-open");drawer.setAttribute("aria-hidden","true");scrim.setAttribute("aria-hidden","true");renderWork()}
function feedback(b){b.classList.remove("play-entry-feedback");void b.offsetWidth;b.classList.add("play-entry-feedback");setTimeout(()=>b.classList.remove("play-entry-feedback"),360)}
function toggleSection(name){openSection=openSection===name?null:name;document.querySelectorAll(".sidebar-section").forEach(s=>{const on=s.dataset.section===openSection;s.classList.toggle("is-expanded",on);const b=s.querySelector(".sidebar-entry"),p=s.querySelector(".sidebar-inline-panel");if(b)b.setAttribute("aria-expanded",on?"true":"false");if(p)p.setAttribute("aria-hidden",on?"false":"true")});if(openSection==="permissions")refreshPermissions();if(openSection==="work")renderWork()}
function permissionState(){const raw=bridge("getPermissionStates");try{return typeof raw==="string"?JSON.parse(raw):{}}catch(e){return{}}}
function renderPermissions(state={}){if(!permissions)return;permissions.replaceChildren();[["accessibility","无障碍"],["overlay","悬浮窗"],["exact","定时"]].forEach(([kind,label])=>{const b=document.createElement("button");b.type="button";b.className=`sidebar-secondary permission-row${state[kind]?" is-granted":""}`;b.innerHTML=`<span>${label}</span><img src="ui/timeline_leaf.png" alt="" draggable="false">`;b.onclick=e=>{e.stopPropagation();bridge("openPermissionSettings",kind)};permissions.appendChild(b)})}
function refreshPermissions(){renderPermissions(permissionState())}
function leafButton(cls,label){const b=document.createElement("button");b.type="button";b.className=cls;b.setAttribute("aria-label",label);b.innerHTML='<img src="ui/timeline_leaf.png" alt="" draggable="false"><img src="ui/timeline_leaf.png" alt="" draggable="false">';return b}
function commit(item,input){item.name=String(input.value||"").trim().slice(0,24)||"未命名";editingId=null;save();renderWork()}
function renderWork(){if(!workPanel)return;workPanel.replaceChildren();const list=document.createElement("div");list.className="sidebar-work-list";items.slice().sort((a,b)=>a.slot-b.slot).forEach(item=>{const row=document.createElement("div");row.className=`sidebar-work-row ff-octagon${editingId===item.id?" is-editing":""}`;if(editingId===item.id){const input=document.createElement("input");input.className="sidebar-work-editor";input.value=item.name==="未命名"?"":item.name;input.maxLength=24;input.enterKeyHint="done";input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();input.blur()}};input.addEventListener("blur",()=>commit(item,input),{once:true});row.appendChild(input);if(items.length>1){const del=leafButton("leaf-delete","删除工作内容");del.onpointerdown=e=>e.preventDefault();del.onclick=e=>{e.stopPropagation();items=items.filter(v=>v.id!==item.id);editingId=null;save();renderWork()};row.appendChild(del)}setTimeout(()=>{input.focus();input.select()},20)}else{const name=document.createElement("button");name.type="button";name.className="sidebar-work-name";name.textContent=item.name;name.ondblclick=e=>{e.stopPropagation();editingId=item.id;renderWork()};row.appendChild(name)}list.appendChild(row)});workPanel.appendChild(list);if(items.length<4){const add=leafButton("leaf-add","新增工作内容");add.onclick=e=>{e.stopPropagation();const slot=[0,1,2,3].find(x=>!items.some(v=>v.slot===x)),id=`work_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;items.push({id,slot,name:"未命名",whitelist:[]});items.sort((a,b)=>a.slot-b.slot);editingId=id;save();renderWork()};workPanel.appendChild(add)}}
function appInfo(id){if(meta[id])return meta[id];const base=LEGACY[id]||{id,name:id},raw=bridge("getWhitelistAppInfo",id);try{if(typeof raw==="string"){const v=JSON.parse(raw);return{id,name:v.name||base.name,iconDataUrl:v.iconDataUrl||v.icon||(v.iconBase64?`data:image/png;base64,${v.iconBase64}`:"")}}}catch(e){}return base}
function appVisual(b,id){const a=appInfo(id),icon=a.iconDataUrl||a.icon||"";if(icon){const img=document.createElement("img");img.src=icon;img.alt=a.name||"";img.draggable=false;img.ondragstart=e=>e.preventDefault();b.appendChild(img)}else{b.classList.add("app-fallback");b.textContent=String(a.name||id).slice(0,2)}b.setAttribute("aria-label",a.name||id)}
function launch(id){if(id.includes("."))bridge("launchPackage",id);else bridge("launchWhitelistApp",id)}
function clearTap(key){const timer=tapTimers.get(key);if(timer)clearTimeout(timer);tapTimers.delete(key)}
function clearHold(key){const timer=holdTimers.get(key);if(timer)clearTimeout(timer);holdTimers.delete(key)}
function clearUnbindVisuals(){pageList.querySelectorAll(".whitelist-app-slot.is-unbinding").forEach(slot=>{slot.classList.remove("is-unbinding");const mark=slot.querySelector(".whitelist-unbind-leaf");if(mark)mark.remove()})}
function unbindLeaf(item,index,slot){
    slot.classList.add("is-unbinding");
    const remove=document.createElement("span");
    remove.className="whitelist-unbind-leaf";
    remove.setAttribute("role","button");
    remove.setAttribute("aria-label","解除白名单绑定");
    remove.innerHTML='<img src="ui/timeline_leaf.png" alt="" draggable="false"><img src="ui/timeline_leaf.png" alt="" draggable="false">';
    remove.onpointerdown=e=>{e.preventDefault();e.stopPropagation()};
    remove.onclick=e=>{e.preventDefault();e.stopPropagation();item.whitelist[index]=null;activeUnbind=null;save();renderPage()};
    slot.appendChild(remove);
}
function bindFilledSlotGestures(slot,item,index,id,key){
    const IDLE=0,PRESSED=1,LONG_PRESSED=2,LONG_PRESS_MS=500,MOVE_TOLERANCE=14;
    let gesture=null;
    const release=pointerId=>{try{if(slot.hasPointerCapture(pointerId))slot.releasePointerCapture(pointerId)}catch(e){}};
    const cancelHold=()=>clearHold(key);
    slot.oncontextmenu=e=>{e.preventDefault();e.stopPropagation()};
    slot.ondragstart=e=>{e.preventDefault();e.stopPropagation()};
    slot.onpointerdown=e=>{
        if(e.isPrimary===false||e.button>0||e.target.closest(".whitelist-unbind-leaf"))return;
        e.preventDefault();
        e.stopPropagation();
        const secondTap=tapTimers.has(key);
        if(secondTap)clearTap(key);
        cancelHold();
        gesture={state:PRESSED,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,maxDistance:0,pointerDown:true,moved:false,secondTap};
        try{slot.setPointerCapture(e.pointerId)}catch(err){}
        holdTimers.set(key,setTimeout(()=>{
            holdTimers.delete(key);
            if(!gesture||gesture.pointerId!==e.pointerId||gesture.state!==PRESSED||!gesture.pointerDown||gesture.maxDistance>MOVE_TOLERANCE)return;
            gesture.state=LONG_PRESSED;
            clearTap(key);
            activeUnbind={itemId:item.id,index};
            clearUnbindVisuals();
            slot.classList.add("play-longpress-feedback");
            unbindLeaf(item,index,slot);
            setTimeout(()=>slot.classList.remove("play-longpress-feedback"),160);
        },LONG_PRESS_MS));
    };
    slot.onpointermove=e=>{
        if(!gesture||gesture.pointerId!==e.pointerId||gesture.state!==PRESSED)return;
        const distance=Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY);
        gesture.maxDistance=Math.max(gesture.maxDistance,distance);
        if(distance>MOVE_TOLERANCE){gesture.moved=true;cancelHold()}
    };
    slot.onpointerup=e=>{
        if(!gesture||gesture.pointerId!==e.pointerId)return;
        e.preventDefault();
        e.stopPropagation();
        const finished=gesture;
        finished.pointerDown=false;
        finished.state=finished.state===LONG_PRESSED?LONG_PRESSED:IDLE;
        gesture=null;
        cancelHold();
        release(e.pointerId);
        if(finished.state===LONG_PRESSED||finished.moved)return;
        if(finished.secondTap){openPicker(item.id,index);return}
        tapTimers.set(key,setTimeout(()=>{tapTimers.delete(key);launch(id)},320));
    };
    slot.onpointercancel=e=>{
        if(!gesture||gesture.pointerId!==e.pointerId)return;
        gesture.pointerDown=false;
        gesture.state=IDLE;
        gesture=null;
        cancelHold();
        release(e.pointerId);
    };
    slot.onclick=e=>{e.preventDefault();e.stopPropagation()};
}
function renderPage(){pageList.replaceChildren();items.slice().sort((a,b)=>a.slot-b.slot).forEach(item=>{const row=document.createElement("div");row.className="whitelist-page-row ff-octagon";const title=document.createElement("span");title.className="whitelist-page-task";title.textContent=item.name;row.appendChild(title);for(let i=0;i<2;i++){const id=item.whitelist[i],key=`${item.id}:${i}`,slot=document.createElement("button");slot.type="button";slot.className="whitelist-app-slot ff-octagon";slot.dataset.whitelistSlot=key;if(id){appVisual(slot,id);if(activeUnbind&&activeUnbind.itemId===item.id&&activeUnbind.index===i)unbindLeaf(item,i,slot);bindFilledSlotGestures(slot,item,i,id,key)}else{slot.textContent="+";slot.onclick=e=>{e.stopPropagation();openPicker(item.id,i)}}row.appendChild(slot)}pageList.appendChild(row)})}
function openPage(){sanitizeBindings();renderPage();closeDrawer();home.classList.add("whitelist-page-open");page.setAttribute("aria-hidden","false")}
function closePage(){if(isPicker()){closePicker();return}home.classList.remove("whitelist-page-open");page.setAttribute("aria-hidden","true");openDrawer()}
function readInstalledFromNative(){const raw=bridge("getInstalledApps");try{return filterInstalled(JSON.parse(raw))}catch(e){return[]}}
function cacheInstalled(values){installedCache=filterInstalled(values);try{localStorage.setItem(APP_CACHE_KEY,JSON.stringify(installedCache.map(app=>({id:app.id,name:app.name,packageName:appPackage(app)}))))}catch(e){}installedCache.forEach(app=>{meta[app.id]={id:app.id,name:app.name,packageName:appPackage(app),iconDataUrl:app.iconDataUrl||""}});saveMeta();sanitizeBindings()}
function renderPickerApps(values,itemId,slotIndex,token){if(token!==pickerLoadToken||!isPicker())return;const item=items.find(v=>v.id===itemId),otherIds=item?item.whitelist.filter((value,index)=>index!==slotIndex&&value):[];pickerList.replaceChildren();filterInstalled(values).filter(app=>item&&!otherIds.includes(app.id)).forEach(app=>{const b=document.createElement("button");b.type="button";b.className="installed-app-choice";appVisual(b,app.id);const label=document.createElement("span");label.textContent=app.name;b.appendChild(label);b.onclick=()=>{const target=items.find(v=>v.id===pickerItemId);if(target&&(pickerSlotIndex===0||pickerSlotIndex===1)){target.whitelist[pickerSlotIndex]=app.id;saveMeta();save()}closePicker();renderPage()};pickerList.appendChild(b)})}
function refreshInstalledCache(onReady){const started=performance.now(),values=readInstalledFromNative();if(values.length){cacheInstalled(values);installedCacheWarm=true}trace("installed app scan",started);if(onReady)onReady(installedCache)}
function openPicker(itemId,slotIndex){const started=performance.now();pickerItemId=itemId;pickerSlotIndex=Number(slotIndex);activeUnbind=null;const token=++pickerLoadToken;home.classList.add("installed-app-picker-open");picker.setAttribute("aria-hidden","false");renderPickerApps(installedCache,itemId,pickerSlotIndex,token);requestAnimationFrame(()=>{trace("app picker first frame",started);if(!installedCacheWarm)setTimeout(()=>refreshInstalledCache(values=>renderPickerApps(values,itemId,pickerSlotIndex,token)),0)})}
function closePicker(){pickerLoadToken+=1;pickerItemId=null;pickerSlotIndex=null;home.classList.remove("installed-app-picker-open");picker.setAttribute("aria-hidden","true")}
function installSwipe(){drawer.onpointerdown=e=>{if(e.isPrimary===false||e.target.closest("input,button"))return;drawerSwipe={id:e.pointerId,x:e.clientX,y:e.clientY}};drawer.onpointerup=e=>{if(!drawerSwipe||drawerSwipe.id!==e.pointerId)return;const dx=e.clientX-drawerSwipe.x,dy=e.clientY-drawerSwipe.y;drawerSwipe=null;if(dx<-28&&Math.abs(dx)>Math.abs(dy)*1.15)closeDrawer()};drawer.onpointercancel=()=>drawerSwipe=null}
function back(){if(window.ForceFocusGuidebook&&typeof window.ForceFocusGuidebook.isOpen==="function"&&window.ForceFocusGuidebook.isOpen()){window.ForceFocusGuidebook.close();return true}if(isPicker()){closePicker();return true}if(isPage()){closePage();return true}if(isOpen()){closeDrawer();return true}return false}
function init(){if(!home||!drawer||!permissions||!workPanel||!page||!picker)return;metrics();renderWork();renderPermissions({});sanitizeBindings();document.querySelectorAll(".sidebar-entry").forEach(b=>b.onclick=e=>{e.stopPropagation();feedback(b);b.dataset.panel==="whitelist"?openPage():toggleSection(b.dataset.panel)});scrim.onclick=closeDrawer;$("#whitelistPageBack").onclick=closePage;$("#installedAppPickerBack").onclick=closePicker;installSwipe();window.addEventListener("forcefocus:metrics",e=>metrics(e.detail));window.addEventListener("focus",()=>setTimeout(refreshPermissions,0));document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(refreshPermissions,0)});document.addEventListener("pointerdown",e=>{if(activeUnbind&&!e.target.closest(".whitelist-app-slot.is-unbinding")){activeUnbind=null;clearUnbindVisuals()}if(!editingId||e.target.closest(".sidebar-work-row"))return;const input=workPanel.querySelector(".sidebar-work-editor");if(input)input.blur()},true);window.dispatchEvent(new CustomEvent("forcefocus:workitemschange",{detail:clone()}));requestAnimationFrame(()=>setTimeout(refreshPermissions,700));const warm=()=>{if(!installedCacheWarm)refreshInstalledCache()};if(typeof requestIdleCallback==="function")requestIdleCallback(warm,{timeout:4500});else setTimeout(warm,3500)}
window.ForceFocusSidebar=Object.freeze({open:openDrawer,close:closeDrawer,handleBack:back,isOpen,getWorkItems:clone,getWorkItemByName:name=>{const v=items.find(x=>x.name===name);return v?{id:v.id,slot:v.slot,name:v.name,whitelist:[...v.whitelist]}:null}});window.ForceFocusBack=back;document.addEventListener("DOMContentLoaded",init,{once:true});
})();
