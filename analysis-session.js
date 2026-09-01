(() => {
"use strict";
const VERSION="3.4.46";
const POLL_MS=1500;
const ADMIN_API="https://hawkvision-admin-api.michael19941009.workers.dev";
const client=window.hvAnalysisAuthClient;
if(!client)return;
const $=id=>document.getElementById(id);
const CAP=9999999999;
const cookieName="hv-device-token";
const state={
 user:null,role:"",isMember:false,modes:{basic:true,counting:false,full:false},
 mode:null,family:null,method:null,points:0,initialPoints:0,profit:0,noCommission:false,
 entered:false,skippedSetup:false,activeUntil:null,remaining:0,usedTotal:0,
 editingSettings:false,manualEdited:false,analysisActive:false,bettingActive:false,
 packQty:{},hourInventory:[],hourHistory:[],settingsSnapshot:null,pendingSettingsCommit:false,currentPublicBetAllowed:false,
 officialHistory:[],progressionIndex:0,skipSettlement:false,deviceToken:"",
 setupComplete:false,lastHoursGeneration:0,lastPasswordGeneration:0,passwordClaim:false,
 actualMode:"basic",modeNotice:"",unitPoints:0,reverseHundredUsed:false,corePause:{active:true,waiting:false,waitLeft:0,pauseStartRound:null,shoeStoppedHands:0,stopDisabled:false},lastRoundEvaluationAllowed:false,lastRoundHadSignal:false
};
let tickTimer=null,pollTimer=null,saveTimer=null,lastRenderedSecond=null;
let hvViewEpoch=0,hvCurrentView="boot";
let hvHoursTransitionPending=false;
function goHoursAfterSetup(){if(hvHoursTransitionPending)return;hvHoursTransitionPending=true;requestAnimationFrame(()=>{hvHoursTransitionPending=false;if(hvCurrentView==="setup"&&state.setupComplete)renderHours()})}

function beginView(name){hvCurrentView=name;hvViewEpoch+=1;return hvViewEpoch}
function isCurrentView(epoch,name){return epoch===hvViewEpoch&&hvCurrentView===name}

const methodInfo={
 standard:{label:"標準均注",style:"",level:"",units:30,historical:20,minGames:6,core:"D6",reverse:false,pause:"none"},
 reverse7:{label:"穩健型・入門",style:"穩健型",level:"入門",units:null,recommendedPoints:5000,minGames:9,core:"D9T",reverse:true,rate:.07,pause:"loss4wait1"},
 d9_1137:{label:"穩健型・標準",style:"穩健型",level:"標準",units:60,minGames:9,core:"D9",seq:[1,1,3,7],lastLoss:0,pause:"none"},
 d9_113715:{label:"穩健型・進階",style:"穩健型",level:"進階",units:90,minGames:9,core:"D9",seq:[1,1,3,7,15],lastLoss:1,pause:"none"},
 reverse8:{label:"均衡型・入門",style:"均衡型",level:"入門",units:null,recommendedPoints:7000,minGames:9,core:"D9T",reverse:true,rate:.08,pause:"none"},
 d9_11371531_wait:{label:"均衡型・進階",style:"均衡型",level:"進階",units:100,minGames:9,core:"D9",seq:[1,1,3,7,15,31],lastLoss:0,pause:"wait1"},
 c10_1371531_recover:{label:"節奏型・標準",style:"節奏型",level:"標準",units:160,minGames:10,core:"C10",seq:[1,3,7,15,31],lastLoss:1,pause:"recover0"},
 d9_1371531_wait:{label:"節奏型・進階",style:"節奏型",level:"進階",units:170,minGames:9,core:"D9",seq:[1,3,7,15,31],lastLoss:0,pause:"wait1"},
 d9_1371531_nostop:{label:"進取型・標準",style:"進取型",level:"標準",units:190,minGames:9,core:"D9",seq:[1,3,7,15,31],lastLoss:1,pause:"none"},
 b3_11371531_nostop:{label:"進取型・進階",style:"進取型",level:"進階",units:200,minGames:3,core:"B3",seq:[1,1,3,7,15,31],lastLoss:1,pause:"none"}
};
const STYLE_INFO={
 stable:{name:"穩健型",icon:"🛡️",brief:"重視點數承受度與穩定性，適合希望降低波動的玩法。",methods:["reverse7","d9_1137","d9_113715"]},
 balanced:{name:"均衡型",icon:"⚖️",brief:"兼顧點數運用與收益能力，在兩者之間取得平衡。",methods:["reverse8","d9_11371531_wait"]},
 tempo:{name:"節奏型",icon:"⌛",brief:"依分析訊號調整出手節奏，在條件適合時進場。",methods:["c10_1371531_recover","d9_1371531_wait"]},
 active:{name:"進取型",icon:"🔥",brief:"提高點數運用與收益潛力，同時承受較高的波動。",methods:["d9_1371531_nostop","b3_11371531_nostop"]}
};
function methodRecommendedPoints(i=info()){return i?(i.reverse?i.recommendedPoints:i.units*100):0}
function methodStyleKey(method=state.method){return Object.keys(STYLE_INFO).find(k=>STYLE_INFO[k].methods.includes(method))||null}
function cookieGet(name){const p=name+"=";const r=document.cookie.split("; ").find(v=>v.startsWith(p));return r?decodeURIComponent(r.slice(p.length)):""}
function cookieSet(name,value){document.cookie=`${name}=${encodeURIComponent(value)}; Domain=.hawkvisionai.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure`}
function token(){let t=cookieGet(cookieName);if(!t){t=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);cookieSet(cookieName,t)}return t}
async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data}
const isMemberRole=()=>state.isMember;
const isManagementRole=()=>!state.isMember;
const modeName=k=>k==="counting"?"算牌模式":k==="full"?"完整模式":"基礎模式";
const fmt=n=>Math.floor(Math.max(0,Number(n)||0)).toLocaleString("zh-TW");
const capMag=n=>Math.min(CAP,Math.floor(Math.abs(Number(n)||0)));
const fmtCap=n=>fmt(capMag(n));
const fmtSignedCap=n=>{n=Number(n)||0;return `${n<0?"-":"+"}${fmtCap(n)}`};
function normalizePointState(source="points"){
 state.initialPoints=Math.max(0,Number(state.initialPoints)||0);
 if(source==="profit"){
   state.profit=Math.max(-state.initialPoints,Number(state.profit)||0);
   state.points=Math.max(0,state.initialPoints+state.profit);
 }else{
   state.points=Math.max(0,Number(state.points)||0);
   state.profit=Math.max(-state.initialPoints,state.points-state.initialPoints);
 }
}
function formatTime(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function calcRemaining(){if(!state.isMember||!state.activeUntil)return 0;return Math.max(0,Math.ceil((new Date(state.activeUntil).getTime()-Date.now())/1000))}
function hasRemainingTime(){return isManagementRole()||calcRemaining()>0}
function info(){return methodInfo[state.method]||null}
function hasChosenNewStrategy(){return !!methodStyleKey(state.method)}
function calculatedUnit(){const i=info();if(!i||i.reverse)return 100;return Math.max(100,Math.floor((Math.max(0,state.points)/i.units)/100)*100)}
function baseUnit(){return Math.max(100,Number(state.unitPoints)||calculatedUnit())}
function progressionType(){const i=info();return i?.reverse?"reverse":(i?.seq?"loss":"flat")}
function progressionMultiplier(){const i=info();if(!i||i.reverse||!i.seq)return 1;return i.seq[Math.min(Math.max(0,state.progressionIndex|0),i.seq.length-1)]}
function suggestedBetPoints(){const i=info();if(i?.reverse){return Math.max(100,Math.ceil((Math.max(0,state.points)*i.rate)/100)*100)}return Math.max(100,baseUnit()*progressionMultiplier())}
function usesCoreStop(){return ["wait1","recover0","loss4wait1"].includes(info()?.pause)}
function stopVariant(){return info()?.pause||"none"}
function freshCorePause(){return {active:true,waiting:false,waitLeft:0,pauseStartRound:null,shoeStoppedHands:0,stopDisabled:false}}
function normalizeCorePause(x){
 const d=freshCorePause(),s=x&&typeof x==="object"?x:{};
 d.active=s.active!==false;d.waiting=!!s.waiting;d.waitLeft=Math.max(0,Number(s.waitLeft||0));
 d.pauseStartRound=Number.isFinite(Number(s.pauseStartRound))?Number(s.pauseStartRound):null;
 d.shoeStoppedHands=Math.max(0,Number(s.shoeStoppedHands||0));d.stopDisabled=!!s.stopDisabled;
 return d
}
function resetCorePause(){state.corePause=freshCorePause()}
function completedRoundCount(){return Math.max(0,Number($("roundCount")?.textContent||0))}
function pausedPhysicalHands(s=state.corePause){if(!s||s.pauseStartRound==null)return 0;return Math.max(0,completedRoundCount()-Number(s.pauseStartRound))}
function finalizeStoppedSegment(s=state.corePause){
 if(!s||s.pauseStartRound==null)return;
 s.shoeStoppedHands=Math.max(0,Number(s.shoeStoppedHands||0))+pausedPhysicalHands(s);
 s.pauseStartRound=null;
 if(stopVariant()==="D6_G30"&&s.shoeStoppedHands>=30)s.stopDisabled=true
}
function maybeForceCoreResume(){
 if(!usesCoreStop())return;
 const s=state.corePause||(state.corePause=freshCorePause());
 if(s.stopDisabled){s.active=true;s.waiting=false;s.waitLeft=0;return}
 if(s.active)return;
 const seg=pausedPhysicalHands(s);
 if(stopVariant()==="D9_C5"&&seg>=5){s.active=true;s.waiting=false;s.waitLeft=0}
 if(stopVariant()==="D6_G30"&&Number(s.shoeStoppedHands||0)+seg>=30){s.active=true;s.waiting=false;s.waitLeft=0;s.stopDisabled=true}
}
function coreBetAllowed(){
 if(!usesCoreStop())return true;
 const s=state.corePause||(state.corePause=freshCorePause());
 maybeForceCoreResume();
 if(s.active&&s.pauseStartRound!=null)finalizeStoppedSegment(s);
 return s.active===true
}
function advanceCorePause(win,roundNumber=null){
 if(!usesCoreStop()||typeof win!=="boolean")return;
 const i=info(),s=state.corePause||(state.corePause=freshCorePause());
 if(i?.pause==="loss4wait1"){
   if(s.active){
     state.progressionIndex=win?0:Math.min(4,state.progressionIndex+1);
     if(!win&&state.progressionIndex>=4){s.active=false;s.waiting=true;s.waitLeft=0;s.pauseStartRound=Math.max(1,Number(roundNumber)||completedRoundCount()+1)}
   }else if(s.waiting&&win){s.waiting=false;s.waitLeft=1}
   else if(s.waitLeft>0){s.waitLeft--;if(s.waitLeft===0){s.active=true;state.progressionIndex=0}}
   return;
 }
 if(s.active){if(!win){s.active=false;s.waiting=true;s.waitLeft=0;s.pauseStartRound=Math.max(1,Number(roundNumber)||completedRoundCount()+1)}}
 else if(s.waiting&&win){s.waiting=false;s.waitLeft=i?.pause==="wait1"?1:0;if(s.waitLeft===0)s.active=true}
 else if(s.waitLeft>0){s.waitLeft--;if(s.waitLeft===0)s.active=true}
}
function currentInternalPrediction(){const p=window.HawkVisionAnalysisCore?.getPendingPrediction?.();return ["莊","閒"].includes(p)?p:null}
// Global main-bet invariant for every analysis mode / play method / staking method:
// tie never settles or consumes an existing Banker/Player decision; the same decision and wager stage continue to the next non-tie hand.
function hasBettableDecision(){const p=currentInternalPrediction();return (p==="莊"||p==="閒")&&state.currentPublicBetAllowed===true}
function displayedSuggested(){if(!(state.analysisActive||state.bettingActive))return "—";if(!hasBettableDecision())return "本局不下注";if(state.points<100||state.skippedSetup)return "—";const wager=suggestedBetPoints();if(info()?.reverse&&wager===100&&state.reverseHundredUsed)return "點數不足";if(wager>state.points)return "本金不足";return `${fmt(wager)} 點`}
function setupComplete(){return !!(state.mode&&state.method)}
function strategyKey(){return `${state.mode||""}|${state.family||""}|${state.method||""}`}
function showShell(){$("hvEntryShell")?.classList.add("show");document.body.classList.remove("hv-analysis-visible");document.body.classList.add("hv-setup-visible")}
function hideShell(){$("hvEntryShell")?.classList.remove("show");document.body.classList.remove("hv-setup-visible")}
function setRoadVisible(open){
 const visible=!!open;
 document.body.classList.toggle("hv-road-open",visible);
 document.body.classList.toggle("hv-road-closed",!visible);
 [$("hvRoadToggleDesktop"),$("hvRoadToggleMobile")].filter(Boolean).forEach(b=>{b.textContent=visible?"隱藏珠盤路":"檢視珠盤路";b.setAttribute("aria-expanded",visible?"true":"false")});
}
function toggleRoad(){setRoadVisible(!document.body.classList.contains("hv-road-open"))}
function setupRoadToggle(){[$("hvRoadToggleDesktop"),$("hvRoadToggleMobile")].filter(Boolean).forEach(b=>b.addEventListener("click",toggleRoad))}
function showAnalysis(){beginView("analysis");hideShell();document.body.classList.add("hv-analysis-visible");document.body.classList.toggle("hv-basic-mode",state.mode==="basic");state.entered=true;normalizePointState("points");renderModeStatus();updatePointCards();$("hvResultMoney")?.classList.toggle("show",!state.skippedSetup);if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested();if(isMemberRole())$("hvMemberTimeBlock")?.classList.add("show");else $("hvMemberTimeBlock")?.classList.remove("show");if(state.mode==="basic")state.noCommission=false;setCommission(state.noCommission);document.querySelector(".hv-commission-inline")?.classList.toggle("hv-hidden-basic",state.mode==="basic");syncStartControls();setRoadVisible(!(state.analysisActive||state.bettingActive));updateTimeUI()}
function hideAnalysis(){document.body.classList.remove("hv-analysis-visible");document.body.classList.remove("hv-basic-mode")}
function setErr(m=""){if($("hvEntryError"))$("hvEntryError").textContent=m}
function brandTitle(extra=""){return `<span class="hv-brand-lockup"><img src="hawkvision-logo.png" alt="HawkVision"><span class="hv-brand-copy"><b><i>Hawk</i><em>Vision</em></b><small>SEE EVERY MOVE. STAY AHEAD.</small></span></span>${extra}`}
function choices(items,attr,current){return items.map(([k,n,disabled])=>`<button type="button" class="hv-choice ${current===k?"selected":""} ${disabled?"future":""}" data-${attr}="${k}" ${disabled?"disabled":""}>${n}</button>`).join("")}
function updatePointCards(){
 normalizePointState("points");
 if($("hvBankrollChip"))$("hvBankrollChip").textContent=fmtCap(state.points);
 if($("hvProfitChip"))$("hvProfitChip").textContent=fmtSignedCap(state.profit);
}
function setCommission(on){state.noCommission=state.mode==="basic"?false:!!on;["hvCommissionSetup","hvCommissionInGame"].forEach(id=>{const b=$(id);if(!b)return;b.classList.toggle("on",state.noCommission);b.setAttribute("aria-pressed",String(state.noCommission))});queueSave()}
function renderModeStatus(){const el=$("hvModeStatus");if(!el)return;const actual=state.actualMode||state.mode||"basic";let text=modeName(actual),warn=false;if(state.modeNotice){text=state.modeNotice;warn=true}el.textContent=text;el.style.display="block";el.classList.toggle("warn",warn);el.classList.toggle("ok",!warn)}
window.HawkVisionModeState={setActualMode(mode,notice=""){state.actualMode=["basic","counting","full"].includes(mode)?mode:"basic";state.modeNotice=String(notice||"");renderModeStatus();queueSave()},markIncomplete(){if(state.mode==="counting"){state.actualMode="basic";state.modeNotice="輸入資料不完整，已切換成基礎模式"}else if(state.mode==="full"){state.actualMode="basic";state.modeNotice="完整資料輸入中，已切換成基礎模式"}renderModeStatus()},restoreFull(){if(state.mode==="full"){state.actualMode="full";state.modeNotice="";renderModeStatus()}},reset(){state.actualMode=state.mode||"basic";state.modeNotice="";renderModeStatus()}};
function warningData(){const i=info();if(!i||state.points<=0)return null;const rec=methodRecommendedPoints(i);if(i.reverse){if(state.points===rec)return ["green","建議點數設定","本次帶入點數符合歷史回測建議點數。此建議已考量歷史回測與限紅因素；點數越高不代表點數使用效益越高。"];return ["red","建議點數設定",`此玩法建議帶入 ${fmt(rec)} 點。此建議已考量歷史回測與限紅因素；點數越高不代表點數使用效益越高。`]}
 const base=rec/1.5,pct=((state.points-base)/base)*100;if(state.points>=rec)return ["green","點數準備已達建議標準",`建議準備：${i.units}注（${fmt(rec)}點）。`];if(pct<=10)return ["red","安全緩衝偏低",`本次帶入點數的安全緩衝偏低。建議準備：${i.units}注。`];if(pct<30)return ["orange","安全緩衝較少",`建議提高點數準備。建議準備：${i.units}注。`];return ["yellow","已有一定安全緩衝",`尚未達建議準備標準。建議準備：${i.units}注。`]}

function setupCarrySnapshot(){
 return state.editingSettings&&state.settingsSnapshot?state.settingsSnapshot:null;
}
function applyMethodDefaultPoints(method){
 const z=methodInfo[method]||null;
 if(!z)return;
 const carry=setupCarrySnapshot();
 if(carry){
   state.points=Math.max(0,Number(carry.points)||0);
   state.initialPoints=Math.max(0,Number(carry.initialPoints)||0);
   state.profit=Number(carry.profit)||0;
   normalizePointState("points");
 }else{
   const v=methodRecommendedPoints(z);
   state.points=v;
   state.initialPoints=v;
   state.profit=0;
 }
 state.unitPoints=z.reverse?0:100;
 state.manualEdited=false;
}
function restoreCarryPointsWhileChoosing(){
 const carry=setupCarrySnapshot();
 if(!carry)return false;
 state.points=Math.max(0,Number(carry.points)||0);
 state.initialPoints=Math.max(0,Number(carry.initialPoints)||0);
 state.profit=Number(carry.profit)||0;
 normalizePointState("points");
 state.manualEdited=false;
 return true;
}
function snapshotSettings(){return {mode:state.mode,family:state.family,method:state.method,points:state.points,initialPoints:state.initialPoints,profit:state.profit,skippedSetup:state.skippedSetup,analysisActive:state.analysisActive,bettingActive:state.bettingActive,progressionIndex:state.progressionIndex,noCommission:state.noCommission,actualMode:state.actualMode,modeNotice:state.modeNotice,unitPoints:state.unitPoints,corePause:JSON.parse(JSON.stringify(state.corePause||freshCorePause())),reverseHundredUsed:!!state.reverseHundredUsed}}
function restoreSettingsSnapshot(){const x=state.settingsSnapshot;if(!x)return;Object.assign(state,x);state.settingsSnapshot=null;state.pendingSettingsCommit=false;state.manualEdited=false}
function enterAnalysisFromSetupButton(){
 try{
   // 固定流程：分析設定頁先判斷會員時數；有時數才能直接進分析，
   // 沒時數才轉時數包。管理者不受此限制。
   if(isMemberRole()&&!hasRemainingTime()){
     renderHours();
     return;
   }

   // 未選任何新風格/層級：使用原正式「標準均注」核心。
   if(!hasChosenNewStrategy()){
     enterDefaultStandard();
     return;
   }

   // 已選新策略：不再經過會靜默 return 的舊 validateSetup 路徑，
   // 直接用畫面值/建議值完成設定後進分析。
   const z=info();
   if(!z){
     setErr("分析設定讀取失敗，請重新選擇層級");
     return;
   }

   const input=$("hvPointsInput");
   const carry=setupCarrySnapshot();
   let v=Number(String(input?.value??state.points??"").replace(/\D/g,""));
   if(carry&&!state.manualEdited){
     state.points=Math.max(0,Number(carry.points)||0);
     state.initialPoints=Math.max(0,Number(carry.initialPoints)||0);
     state.profit=Number(carry.profit)||0;
     normalizePointState("points");
     v=state.points;
     if(input)input.value=String(Math.floor(v));
   }else if(!Number.isFinite(v)||v<=0){
     v=methodRecommendedPoints(z);
     state.points=v;
     if(carry){
       state.initialPoints=Math.max(0,Number(carry.initialPoints)||0);
       normalizePointState("points");
     }else{
       state.initialPoints=v;
       state.profit=0;
     }
     if(input)input.value=String(v);
   }else{
     v=Math.min(CAP,Math.max(0,v));
     state.points=v;
     if(carry){
       state.initialPoints=Math.max(0,Number(carry.initialPoints)||0);
       normalizePointState("points");
     }else{
       state.initialPoints=v;
       state.profit=0;
     }
   }

   state.mode="basic";
   state.actualMode="basic";
   state.setupComplete=true;
   state.skippedSetup=false;
   state.noCommission=false;

   if(z.reverse){
     state.unitPoints=0;
   }else if(!state.unitPoints||state.manualEdited){
     state.unitPoints=calculatedUnit();
   }

   const previousMethod=carry?.method||window.HawkVisionAnalysisCore?.getStrategyMethod?.()||null;
   const strategyChanged=!!previousMethod&&previousMethod!==state.method;

   state.manualEdited=false;
   state.pendingSettingsCommit=false;
   state.editingSettings=false;

   if(strategyChanged){
     // 固定規則：切換玩法 / 層級 / 打法 = 開啟全新分析。
     // 只保留目前剩餘點數與本次輸贏；舊鞋所有分析資料全部清除。
     const keepPoints=state.points;
     const keepInitialPoints=state.initialPoints;
     const keepProfit=state.profit;

     window.HawkVisionAnalysisCore?.resetShoe?.();

     state.points=keepPoints;
     state.initialPoints=keepInitialPoints;
     state.profit=keepProfit;
     normalizePointState("points");

     state.analysisActive=false;
     state.bettingActive=false;
     state.progressionIndex=0;
     state.currentPublicBetAllowed=false;
     state.reverseHundredUsed=false;
     state.officialHistory=[];
     state.skipSettlement=false;
     state.lastRoundEvaluationAllowed=false;
     state.lastRoundHadSignal=false;
     resetCorePause();
     resetOfficialStats();
     resetSkip();
     setRoadVisible(true);
   }

   window.HawkVisionAnalysisCore?.setStrategy?.(state.method);
   window.HawkVisionAnalysisCore?.setLookback?.(requiredGames());
   updatePointCards();
   queueSave();
   showAnalysis();
 }catch(err){
   console.error("分析設定進入分析失敗",err);
   setErr("無法進入分析："+(err?.message||String(err)));
 }
}

function enterDefaultStandard(){
 const returningFromSettings=state.editingSettings;
 state.mode="basic";
 state.actualMode="basic";
 state.family="uniform";
 state.method="standard";
 state.noCommission=false;
 state.skippedSetup=true;
 state.setupComplete=true;
 state.editingSettings=false;
 state.pendingSettingsCommit=false;
 state.manualEdited=false;
 if(!state.unitPoints)state.unitPoints=100;
 window.HawkVisionAnalysisCore?.setStrategy?.("standard");
 window.HawkVisionAnalysisCore?.setLookback?.(6);
 queueSave();
 showAnalysis();
 if(returningFromSettings)setRoadVisible(true);
}
function renderSetup(){
 if(matchMedia("(max-width:700px)").matches){
   requestAnimationFrame(()=>{
     const shell=$("hvEntryShell");
     if(shell&&(!state.family||!state.method)){
       shell.scrollTop=0;
       window.scrollTo(0,0);
     }
   });
 }
 beginView("setup");showShell();setErr("");state.mode="basic";if(state.family==="goal")state.family=null;
 $("hvEntryTitle").innerHTML=brandTitle("");$("hvEntryHint").textContent="";["hvEntryBack","hvEntrySkip","hvEntryNext"].forEach(id=>$(id).style.display="none");
 const activeStyle=(state.family&&STYLE_INFO[state.family]?state.family:methodStyleKey()),i=activeStyle?info():null,warn=activeStyle?warningData():null,canPoints=!!(activeStyle&&state.method);
 const card=k=>{const x=STYLE_INFO[k],sel=activeStyle===k;const desc=sel&&state.method?(i.reverse?(i===methodInfo.reverse7?"依目前點數動態調整下注點數，著重點數承受度與穩定性。":"依目前點數動態調整下注點數，在點數運用與收益能力之間取得平衡。"):(k==="tempo"?"依分析訊號控制出手節奏，條件適合時進場。":k==="active"?"提高點數運用與收益潛力，同時承受較高波動。":"依所選層級執行對應的分析與點數控制。")):"";return `<div class="hv-style-card ${sel?"selected":""}" data-style="${k}"><div class="hv-style-head"><b>${x.icon} ${x.name}</b></div><p>${x.brief}</p><div class="hv-level-wrap">${sel?`<div class="hv-level-label">選擇層級</div><div class="hv-levels">${x.methods.map(m=>{const z=methodInfo[m];return `<button type="button" data-method="${m}" class="${state.method===m?"selected":""}">${z.level}</button>`}).join("")}</div><div class="hv-level-desc ${state.method?"show":""}">${desc}</div>`:""}</div></div>`};
 const need=i?(i.reverse?`${fmt(i.recommendedPoints)}點`:`${i.units}注`):"—";
 let html=`<div class="hv-goal-setup"><section class="hv-goal-main"><div class="hv-goal-kicker"><span>分析設定</span> 選擇適合你的玩法風格</div><h2>選擇玩法風格</h2><p class="hv-goal-sub">先依照偏好的出手節奏與點數運用方式選擇風格，再於該風格內選擇層級。</p><div class="hv-style-grid"><div class="hv-style-col ${activeStyle==="stable"||activeStyle==="tempo"?"has-open":""}">${card("stable")}${card("tempo")}</div><div class="hv-style-col ${activeStyle==="balanced"||activeStyle==="active"?"has-open":""}">${card("balanced")}${card("active")}</div></div></section><aside class="hv-goal-side"><h2>本次分析設定</h2><div class="hv-goal-summary"><div><span>玩法風格</span><b>${activeStyle?STYLE_INFO[activeStyle].name:"—"}</b></div><div><span>選擇層級</span><b>${i?i.level:"—"}</b></div><div><span>建議準備</span><b>${need}</b></div></div><label class="hv-point-label">本次帶入點數</label><input id="hvPointsInput" class="hv-point-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" value="${canPoints?Math.min(CAP,Math.floor(state.points)):""}" ${canPoints?"":"disabled"}><div class="hv-goal-warning ${warn?warn[0]:"empty"}">${warn?`<strong>${warn[1]}</strong><p>${warn[2]}</p>`:""}</div><div class="hv-legend"><i></i><i></i><i></i><i></i></div><div class="hv-goal-bottom"><div class="hv-goal-status">${isMemberRole()?(hasRemainingTime()?"會員・有剩餘時數":"會員・無剩餘時數"):"管理帳號"}</div><button id="hvInlineEnter" type="button">${isMemberRole()&&!hasRemainingTime()?"開啟時數包":"進入分析"}</button></div></aside></div>`;
 $("hvEntryBody").innerHTML=html;
 $("hvEntryBody").querySelectorAll("[data-style]").forEach(c=>c.onclick=e=>{if(e.target.closest("[data-method]"))return;const k=c.dataset.style;if(activeStyle===k){state.family=null;state.method=null;if(!restoreCarryPointsWhileChoosing()){state.points=0;state.initialPoints=0;state.profit=0}state.unitPoints=0;state.manualEdited=false;document.activeElement?.blur?.()}else{state.family=k;state.method=null;if(!restoreCarryPointsWhileChoosing()){state.points=0;state.initialPoints=0;state.profit=0}state.unitPoints=0;state.manualEdited=false}renderSetup()});
 $("hvEntryBody").querySelectorAll("[data-method]").forEach(b=>b.onclick=e=>{e.stopPropagation();state.method=b.dataset.method;const z=info();applyMethodDefaultPoints(state.method);renderSetup();const mobile=matchMedia("(max-width:700px)").matches;const input=$("hvPointsInput");if(input){input.focus();try{const n=input.value.length;input.setSelectionRange(n,n)}catch(_){ }if(mobile){requestAnimationFrame(()=>{const shell=$("hvEntryShell"),side=document.querySelector(".hv-goal-side");if(shell&&side){shell.scrollTo({top:Math.max(0,side.offsetTop-8),behavior:"smooth"})}})}}});
 $("hvPointsInput")?.addEventListener("input",e=>{const raw=String(e.target.value).replace(/\D/g,"").slice(0,10);e.target.value=raw;state.points=Math.min(CAP,Number(raw||0));state.manualEdited=true;const carry=setupCarrySnapshot();if(carry){state.initialPoints=Math.max(0,Number(carry.initialPoints)||0);normalizePointState("points")}else{state.initialPoints=state.points;state.profit=0}renderDynamicSetupBits()});
 const inlineEnter=$("hvInlineEnter");if(inlineEnter){inlineEnter.disabled=false;inlineEnter.onclick=()=>enterAnalysisFromSetupButton();}
}
function renderDynamicSetupBits(){const i=info(),warn=warningData();const box=document.querySelector(".hv-goal-warning");if(box){box.className=`hv-goal-warning ${warn?warn[0]:"empty"}`;box.innerHTML=warn?`<strong>${warn[1]}</strong><p>${warn[2]}</p>`:""}}
function validateSetup(){if(!setupComplete())return false;const v=Math.min(CAP,Math.max(0,Number($("hvPointsInput")?.value||state.points||0)));if(!Number.isFinite(v))return false;state.points=v;state.skippedSetup=false;return true}
function commitSettings(){const before=state.settingsSnapshot;const oldKey=before?`${before.mode||""}|${before.family||""}|${before.method||""}`:null;const changed=!!before&&oldKey!==strategyKey();if(state.manualEdited){if(before){state.initialPoints=Math.max(0,Number(before.initialPoints)||0);normalizePointState("points")}else{state.initialPoints=state.points;state.profit=0}}else if(before){state.points=Math.max(0,Number(before.points)||0);state.initialPoints=Math.max(0,Number(before.initialPoints)||0);state.profit=Number(before.profit)||0;normalizePointState("points")}if(info()?.reverse)state.unitPoints=0;else if(changed||state.manualEdited||!state.unitPoints)state.unitPoints=calculatedUnit();if(state.mode==="basic")state.noCommission=false;if(changed){
 const keepPoints=state.points,keepInitialPoints=state.initialPoints,keepProfit=state.profit;
 window.HawkVisionAnalysisCore?.resetShoe?.();
 state.points=keepPoints;state.initialPoints=keepInitialPoints;state.profit=keepProfit;normalizePointState("points");
 state.analysisActive=false;state.bettingActive=false;state.progressionIndex=0;
 state.officialHistory=[];state.skipSettlement=false;state.currentPublicBetAllowed=false;
 state.reverseHundredUsed=false;state.lastRoundEvaluationAllowed=false;state.lastRoundHadSignal=false;
 resetCorePause();resetOfficialStats();resetSkip();setRoadVisible(true);updatePointCards()
}state.actualMode=state.mode||"basic";state.modeNotice="";state.settingsSnapshot=null;state.pendingSettingsCommit=false;state.editingSettings=false;state.manualEdited=false;state.setupComplete=true;window.HawkVisionAnalysisCore?.setStrategy?.(state.method);window.HawkVisionAnalysisCore?.setLookback?.(requiredGames());queueSave()}
function enterFromSetup(){if(!validateSetup())return;const returningFromSettings=state.editingSettings;if(state.editingSettings)state.pendingSettingsCommit=true;if(state.pendingSettingsCommit)commitSettings();else{state.setupComplete=true;state.actualMode=state.mode||"basic";if(!state.unitPoints)state.unitPoints=calculatedUnit();if(state.mode==="basic")state.noCommission=false;window.HawkVisionAnalysisCore?.setStrategy?.(state.method);window.HawkVisionAnalysisCore?.setLookback?.(requiredGames());queueSave()}if(isMemberRole()&&!hasRemainingTime()){goHoursAfterSetup();return}showAnalysis();if(returningFromSettings)setRoadVisible(true)}
function closeHourConfirm(){document.getElementById("hvHourConfirm")?.remove()}
async function loadHours(){if(!state.isMember){state.hourInventory=[];state.hourHistory=[];state.usedTotal=0;return null}const d=await rpc("hv_analysis_member_hours_v1");state.hourInventory=Array.isArray(d?.available)?d.available:[];state.hourHistory=Array.isArray(d?.used)?d.used:[];state.activeUntil=d?.active_until||state.activeUntil;state.lastHoursGeneration=Math.max(Number(state.lastHoursGeneration||0),Number(d?.hours_generation??d?.generation??0));state.usedTotal=Number(d?.total_activated_hours||0);return d}
function openHourConfirm(hours,qty,max){qty=Math.max(1,Math.min(max,Number(qty)||1));closeHourConfirm();const overlay=document.createElement("div");overlay.id="hvHourConfirm";overlay.className="hv-hour-confirm-overlay";overlay.innerHTML=`<div class="hv-hour-confirm-card" role="dialog" aria-modal="true" aria-label="確認開啟時數包"><h3>確認開啟時數包？</h3><div class="hv-hour-confirm-detail"><span>${hours} 小時</span><strong>開啟數量 ${qty} 包</strong></div><p>開啟後時間將立即開始倒數</p><div class="hv-hour-confirm-warning">時間倒數無法暫停</div><div class="hv-hour-confirm-actions"><button type="button" data-confirm-cancel>取消</button><button class="primary" type="button" data-confirm-open>確認開啟</button></div></div>`;document.body.appendChild(overlay);overlay.querySelector("[data-confirm-cancel]").onclick=closeHourConfirm;overlay.addEventListener("click",e=>{if(e.target===overlay)closeHourConfirm()});overlay.querySelector("[data-confirm-open]").onclick=async e=>{const btn=e.currentTarget;btn.disabled=true;setErr("");try{const r=await rpc("hv_analysis_activate_hour_packages_v2",{p_hours_per_package:hours,p_package_count:qty});state.activeUntil=r?.active_until||state.activeUntil;closeHourConfirm();await renderHours();updateTimeUI();queueSave()}catch(err){setErr(err.message||String(err));btn.disabled=false}}}
async function renderHours(){const viewEpoch=beginView("hours");showShell();setErr("");if(isMemberRole())await loadHours().catch(e=>{if(isCurrentView(viewEpoch,"hours"))setErr(e.message||String(e))});if(!isCurrentView(viewEpoch,"hours"))return;$("hvEntryTitle").innerHTML=brandTitle(`<span class="hv-hours-top-right"><span class="hv-used-total">${isMemberRole()?`已使用總時數 <b>${state.usedTotal}</b> 小時`:""}</span><button id="hvHoursEnter" class="hv-top-close" type="button">進入分析</button></span>`);$("hvEntryHint").textContent="";["hvEntryBack","hvEntrySkip","hvEntryNext"].forEach(id=>$(id).style.display="none");const packs=state.hourInventory.filter(p=>Number(p.available_count)>0);const packHtml=isManagementRole()?`<div class="hv-hours-unlimited">不受時數限制</div>`:(packs.length?packs.map(p=>{const h=Number(p.hours_per_package),count=Number(p.available_count),qty=Math.max(1,Math.min(count,state.packQty[h]||1));state.packQty[h]=qty;return `<div class="hv-hour-row-wrap"><div class="hv-hour-card"><div><strong>${h} 小時</strong><small>可使用 ${count} 包</small></div><div class="hv-pack-actions"><div class="hv-inline-stepper" aria-label="開啟數量"><button type="button" data-pack-minus="${h}" ${qty<=1?"disabled":""}>−</button><strong>${qty}</strong><button type="button" data-pack-plus="${h}" ${qty>=count?"disabled":""}>+</button></div><button class="hv-hour-open" data-hour="${h}" data-max="${count}" type="button">開啟</button></div></div></div>`}).join(""):`<div class="hv-hours-none">沒有可用時數，請聯繫上層</div>`);$("hvEntryBody").innerHTML=`<div class="hv-time-panel"><div class="hv-time-caption">目前剩餘時間</div><div id="hvHoursLiveTime" class="hv-time-big">${isManagementRole()?"不受限制":formatTime(calcRemaining())}</div></div><section class="hv-hours-available"><h3>可使用時數包</h3><div class="hv-hour-list">${packHtml}</div></section>`;const enterHoursAnalysis=()=>{if(state.pendingSettingsCommit)commitSettings();if(hasChosenNewStrategy())showAnalysis();else enterDefaultStandard()};const hoursEnter=$("hvHoursEnter");if(hoursEnter)hoursEnter.onclick=enterHoursAnalysis;if(isMemberRole()){$("hvEntryBody").querySelectorAll("[data-pack-minus]").forEach(b=>b.onclick=()=>{const h=Number(b.dataset.packMinus);state.packQty[h]=Math.max(1,(state.packQty[h]||1)-1);renderHours()});$("hvEntryBody").querySelectorAll("[data-pack-plus]").forEach(b=>b.onclick=()=>{const h=Number(b.dataset.packPlus),p=state.hourInventory.find(x=>Number(x.hours_per_package)===h);state.packQty[h]=Math.min(Number(p?.available_count||1),(state.packQty[h]||1)+1);renderHours()});$("hvEntryBody").querySelectorAll(".hv-hour-open").forEach(b=>b.onclick=()=>{const h=Number(b.dataset.hour),max=Number(b.dataset.max);openHourConfirm(h,state.packQty[h]||1,max)})}}
function updateTimeUI(){if(!state.isMember){$("hvMemberTimeBlock")?.classList.remove("show");if($("hvMenuRemainingTime"))$("hvMenuRemainingTime").style.display="none";applyTimeLock();return}const sec=calcRemaining();state.remaining=sec;if(sec!==lastRenderedSecond){lastRenderedSecond=sec;const t=formatTime(sec);if($("hvHoursLiveTime"))$("hvHoursLiveTime").textContent=t;$("hvMemberTimeBlock")?.classList.add("show");if($("hvRemainingTimeTop"))$("hvRemainingTimeTop").textContent=t;if($("hvMenuRemainingTime")){$("hvMenuRemainingTime").style.display="block";$("hvMenuRemainingTime").textContent=`剩餘時間 ${t}`}}applyTimeLock()}
function applyTimeLock(){const locked=state.isMember&&hvCurrentView==="analysis"&&calcRemaining()<=0;document.body.classList.toggle("hv-time-locked",locked);const banner=$("hvLockBanner");if(banner){banner.textContent="剩餘時數不足，請聯繫上層";banner.classList.toggle("show",locked)}document.querySelectorAll('#hvFunctionPopover [data-hv-fn]').forEach(b=>{const fn=b.dataset.hvFn;b.disabled=locked&&!['hours','logout'].includes(fn)})}
function serializeSettings(){return {setup_completed:state.setupComplete,selected_mode:state.mode,actual_mode:state.actualMode,mode_notice:state.modeNotice,bankroll_base:state.initialPoints,current_bankroll:state.points,profit:state.profit,betting:{family:state.family,method:state.method,no_commission:state.noCommission,analysis_active:state.analysisActive,betting_active:state.bettingActive,progression_index:state.progressionIndex,unit_points:state.unitPoints,core_pause:state.corePause,official_history:state.officialHistory,reverse_hundred_used:state.reverseHundredUsed,skipped_setup:state.skippedSetup},screen:"analysis"}}
function queueSave(analysisState){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveRuntime(analysisState).catch(()=>{}),250)}
window.hvAnalysisRuntimeSave=analysisState=>queueSave(analysisState);
async function saveRuntime(analysisState){if(!state.user)return;await rpc("hv_analysis_save_runtime_v1",{p_device_token:state.deviceToken,p_settings:serializeSettings(),p_analysis_state:analysisState||window.HawkVisionAnalysisCore?.exportState?.()||{}})}
function openSettingsEditor(){
 normalizePointState("points");updatePointCards();
 state.settingsSnapshot=snapshotSettings();
 state.editingSettings=true;state.manualEdited=false;state.pendingSettingsCommit=false;
 renderSetup()
}
function setupMenu(){const btn=$("hvFunctionBtn"),pop=$("hvFunctionPopover");if(!btn||!pop)return;pop.querySelectorAll('[data-hv-role="member"]').forEach(x=>x.style.display=isMemberRole()?"block":"none");pop.querySelectorAll('[data-hv-role="management"]').forEach(x=>x.style.display=isManagementRole()?"block":"none");const hoursBtn=pop.querySelector('[data-hv-fn="hours"]');if(hoursBtn)hoursBtn.textContent=isMemberRole()?"我的時數包":"時數包";btn.addEventListener("click",e=>{e.stopPropagation();pop.classList.toggle("show")});document.addEventListener("click",e=>{if(pop.classList.contains("show")&&!pop.contains(e.target)&&e.target!==btn)pop.classList.remove("show")});pop.querySelectorAll("[data-hv-fn]").forEach(b=>b.addEventListener("click",async()=>{pop.classList.remove("show");const fn=b.dataset.hvFn;if(fn==="settings"||fn==="mode"||fn==="bankroll"||fn==="betting")openSettingsEditor();else if(fn==="hours")await renderHours();else if(fn==="platforms"&&isManagementRole())location.href="https://hawkvisionai.com/";else if(fn==="logout"){
 if(state.isMember&&calcRemaining()<=0){
  clearExpiredMemberRuntime();
  await saveRuntime({}).catch(()=>{})
 }else{
  await saveRuntime().catch(()=>{})
 }
 await window.hvGlobalLogout?.()
}}))}
function effectiveRoundCount(){return Math.max(0,Number($("bankerTotal")?.textContent||0)+Number($("playerTotal")?.textContent||0))}
function requiredGames(){return info()?.minGames||6}
function strategyRoundCount(){return info()?.reverse?completedRoundCount():effectiveRoundCount()}
function syncStartControls(){const req=requiredGames(),effective=Math.min(strategyRoundCount(),req),ready=effective>=req&&!document.body.classList.contains("hv-time-locked");if(effective<req&&(state.analysisActive||state.bettingActive)){
 state.analysisActive=false;state.bettingActive=false;state.progressionIndex=0;
 state.currentPublicBetAllowed=false;state.lastRoundEvaluationAllowed=false;state.lastRoundHadSignal=false;
 resetSkip();window.HawkVisionAnalysisCore?.deactivateAnalysisPreserveShoe?.();
 if($("hvSuggestedBet"))$("hvSuggestedBet").textContent="—"
}const a=$("hvStartAnalysis"),b=$("hvStartBetting"),hint=$("hvRequiredGames");if(hint){const total=Math.max(0,Number($("roundCount")?.textContent||0));hint.innerHTML=`<span>輸入有效局數 ${effective}/${req}</span><span class="hv-mobile-total">總局數 ${total}</span>`;}if(a){a.textContent=state.analysisActive?"分析中":"開始分析";a.disabled=!ready||state.bettingActive||state.analysisActive}if(b){b.textContent=state.bettingActive?"下注中":"開始下注";b.disabled=!ready||state.bettingActive}}
function resetOfficialStats(){window.HawkVisionAnalysisCore?.resetEvaluationStatsPreserveShoe?.();if($("correctCount"))$("correctCount").textContent="0";if($("wrongCount"))$("wrongCount").textContent="0";if($("maxWinStreak"))$("maxWinStreak").textContent="0";if($("maxLossStreak"))$("maxLossStreak").textContent="0";if($("accuracyRate"))$("accuracyRate").textContent="—";if($("streakStatus"))$("streakStatus").innerHTML="<span>目前狀態</span><strong>尚無紀錄</strong>"}
function resetSkip(){state.skipSettlement=false;const c=$("hvSkipSettlement");if(c)c.checked=false}
function captureRoundSnapshot(roundNumber){
 const coreSnapshot=window.HawkVisionAnalysisCore?.captureExactSnapshot?.()||null;
 return {
  schema:2,roundNumber,
  points:state.points,initialPoints:state.initialPoints,profit:state.profit,
  mode:state.mode,actualMode:state.actualMode,modeNotice:state.modeNotice,
  family:state.family,method:state.method,unitPoints:state.unitPoints,
  noCommission:!!state.noCommission,setupComplete:!!state.setupComplete,
  skippedSetup:!!state.skippedSetup,progressionIndex:state.progressionIndex,
  corePause:JSON.parse(JSON.stringify(state.corePause||freshCorePause())),
  analysisActive:!!state.analysisActive,bettingActive:!!state.bettingActive,
  skipSettlement:!!state.skipSettlement,
  reverseHundredUsed:!!state.reverseHundredUsed,
  lastRoundEvaluationAllowed:!!state.lastRoundEvaluationAllowed,
  lastRoundHadSignal:!!state.lastRoundHadSignal,
  currentPublicBetAllowed:!!state.currentPublicBetAllowed,
  roadOpen:document.body.classList.contains("hv-road-open"),
  coreSnapshot
 }
}
function settleRound(result){
 const currentRound=Math.max(0,Number($("roundCount")?.textContent||0));
 if(currentRound>=66)return;
 const predicted=currentInternalPrediction(),skip=!!$("hvSkipSettlement")?.checked;
 const roundNumber=currentRound+1,pauseBefore=JSON.parse(JSON.stringify(state.corePause||freshCorePause()));

 // 每一個實際輸入局，在任何模式／打法／配注下，都先保存「輸入前完整快照」。
 state.officialHistory.push(captureRoundSnapshot(roundNumber));

 // 主注莊/閒硬規則：和局不結算、不消耗判定、不推進配注、不推進停止核心。
 // 若和局前已有可公開的莊/閒判定，判定與該階段建議下注原封不動延續到下一個非和局。
 if(result==="和"){
   state.lastRoundHadSignal=false;
   state.lastRoundEvaluationAllowed=false;
   resetSkip();
   updatePointCards();
   if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested();
   queueSave();
   return
 }

 const signal=!!predicted,allowedBefore=signal&&hasBettableDecision();
 state.lastRoundHadSignal=signal;state.lastRoundEvaluationAllowed=!!(state.analysisActive&&allowedBefore);
 if(!signal){state.currentPublicBetAllowed=false;updatePointCards();resetSkip();if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested();queueSave();return}
 const win=predicted===result;
 if(state.bettingActive&&allowedBefore&&!skip){
   const wager=suggestedBetPoints();
   if(wager<=state.points){
     const delta=win?(predicted==="莊"?wager*0.95:wager):-wager;
     state.points=state.points+delta;normalizePointState("points");
     const t=progressionType(),mi=info();
     if(mi?.reverse){if(wager===100)state.reverseHundredUsed=true;if(mi.pause!=="loss4wait1")state.progressionIndex=0}
     else if(t==="loss"&&mi?.seq){state.progressionIndex=win?0:(state.progressionIndex>=mi.seq.length-1?Math.max(0,Number(mi.lastLoss||0)):state.progressionIndex+1)}
     else state.progressionIndex=0;
   }
 }
 if(state.analysisActive)advanceCorePause(win,roundNumber);
 state.currentPublicBetAllowed=false;updatePointCards();resetSkip();if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested();queueSave()
}
function restoreExactRoundSnapshot(snapshot){
 if(!snapshot||snapshot.schema!==2||!snapshot.coreSnapshot)return false;
 state.points=Number(snapshot.points||0);
 if(snapshot.initialPoints!==undefined)state.initialPoints=Number(snapshot.initialPoints||0);
 state.profit=Number(snapshot.profit||0);normalizePointState("points");
 if(snapshot.mode!==undefined)state.mode=snapshot.mode;
 if(snapshot.actualMode!==undefined)state.actualMode=snapshot.actualMode;
 if(snapshot.modeNotice!==undefined)state.modeNotice=snapshot.modeNotice||"";
 if(snapshot.family!==undefined)state.family=snapshot.family;
 if(snapshot.method!==undefined)state.method=snapshot.method;
 if(snapshot.unitPoints!==undefined)state.unitPoints=Math.max(0,Number(snapshot.unitPoints||0));
 if(snapshot.noCommission!==undefined)state.noCommission=!!snapshot.noCommission;
 if(snapshot.setupComplete!==undefined)state.setupComplete=!!snapshot.setupComplete;
 if(snapshot.skippedSetup!==undefined)state.skippedSetup=!!snapshot.skippedSetup;
 state.progressionIndex=Math.max(0,Number(snapshot.progressionIndex||0));
 state.corePause=normalizeCorePause(snapshot.corePause);
 state.analysisActive=!!snapshot.analysisActive;state.bettingActive=!!snapshot.bettingActive;
 state.skipSettlement=!!snapshot.skipSettlement;
 state.reverseHundredUsed=!!snapshot.reverseHundredUsed;
 state.lastRoundEvaluationAllowed=!!snapshot.lastRoundEvaluationAllowed;
 state.lastRoundHadSignal=!!snapshot.lastRoundHadSignal;
 state.currentPublicBetAllowed=!!snapshot.currentPublicBetAllowed;
 window.HawkVisionAnalysisCore?.setStrategy?.(state.method);
 window.HawkVisionAnalysisCore?.setLookback?.(requiredGames());
 const restored=window.HawkVisionAnalysisCore?.restoreExactSnapshot?.(snapshot.coreSnapshot)===true;
 if(!restored)return false;
 const skipBox=$("hvSkipSettlement");if(skipBox)skipBox.checked=state.skipSettlement;
 setRoadVisible(!!snapshot.roadOpen);
 updatePointCards();
 if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested();
 syncStartControls();queueSave(snapshot.coreSnapshot);
 return true
}
function undoLastRoundExact(){
 const currentRound=Math.max(0,Number(window.HawkVisionAnalysisCore?.getRoundCount?.()||$("roundCount")?.textContent||0));
 if(currentRound<=0)return false;
 let idx=-1;
 for(let i=state.officialHistory.length-1;i>=0;i--){
   if(Number(state.officialHistory[i]?.roundNumber)===currentRound){idx=i;break}
 }
 if(idx<0)return false;
 const snapshot=state.officialHistory[idx];
 if(snapshot?.schema!==2||!snapshot?.coreSnapshot)return false;
 // 一次回撤一局：刪除被撤銷局以及其後不應存在的快照。
 state.officialHistory.splice(idx);
 return restoreExactRoundSnapshot(snapshot);
  setRoadVisible(true);

}
function setupStartButtons(){setupRoadToggle();$("hvStartAnalysis")?.addEventListener("click",async()=>{if(state.bettingActive||state.analysisActive)return;state.analysisActive=true;state.currentPublicBetAllowed=false;setRoadVisible(false);if($("hvSuggestedBet"))$("hvSuggestedBet").textContent="—";syncStartControls();await window.HawkVisionAnalysisCore?.analyzeNow?.();queueSave()});$("hvStartBetting")?.addEventListener("click",async()=>{if(state.bettingActive)return;const hadAnalysis=state.analysisActive;state.analysisActive=true;state.bettingActive=true;state.currentPublicBetAllowed=false;setRoadVisible(false);state.progressionIndex=0;if(!hadAnalysis)resetCorePause();resetOfficialStats();if(!hadAnalysis)await window.HawkVisionAnalysisCore?.analyzeNow?.();if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested();syncStartControls();queueSave()});document.querySelectorAll("[data-result]").forEach(btn=>btn.addEventListener("click",()=>settleRound(btn.dataset.result),true));$("confirmNewShoe")?.addEventListener("click",()=>setTimeout(()=>{
 setRoadVisible(true);
 state.analysisActive=false;state.bettingActive=false;state.progressionIndex=0;
 state.reverseHundredUsed=false;state.officialHistory=[];state.currentPublicBetAllowed=false;
 resetCorePause();resetSkip();
 updatePointCards();
 if($("hvSuggestedBet"))$("hvSuggestedBet").textContent="—";
 syncStartControls();queueSave()
},0));$("hvSkipSettlement")?.addEventListener("change",e=>{state.skipSettlement=!!e.target.checked});[$("roundCount"),$("bankerTotal"),$("playerTotal")].filter(Boolean).forEach(el=>new MutationObserver(syncStartControls).observe(el,{childList:true,subtree:true,characterData:true}));syncStartControls()}
function renderPasswordClaim(){beginView("password");state.passwordClaim=true;showShell();hideAnalysis();setErr("");$("hvEntryTitle").textContent="首次登入｜設定新密碼";$("hvEntryHint").textContent="第一次登入必須先設定自己的新密碼；設定成功後系統會登出，請使用新密碼重新登入。";$("hvEntryBody").innerHTML='<div class="hv-field"><label>新密碼</label><div class="hv-password-wrap"><input id="hvNewPassword" type="password" autocomplete="new-password" placeholder="至少 8 個字元"><button class="hv-password-toggle" type="button" data-password-target="hvNewPassword">顯示</button></div></div><div class="hv-field"><label>再次輸入新密碼</label><div class="hv-password-wrap"><input id="hvNewPassword2" type="password" autocomplete="new-password" placeholder="再次輸入新密碼"><button class="hv-password-toggle" type="button" data-password-target="hvNewPassword2">顯示</button></div></div><button id="hvClaimLogout" class="hv-claim-logout" type="button">登出並返回登入</button>';$("hvClaimLogout")?.addEventListener("click",()=>window.hvGlobalLogout?.());$("hvEntryBody").querySelectorAll("[data-password-target]").forEach(btn=>btn.addEventListener("click",()=>{const input=$(btn.dataset.passwordTarget);if(!input)return;const showing=input.type==="text";input.type=showing?"password":"text";btn.textContent=showing?"顯示":"隱藏"}));$("hvEntryBack").style.display="none";$("hvEntrySkip").style.display="none";$("hvEntryNext").style.display="inline-block";$("hvEntryNext").textContent="設定新密碼並重新登入";$("hvEntryNext").onclick=submitPasswordClaim}
async function submitPasswordClaim(){const p1=$("hvNewPassword")?.value||"",p2=$("hvNewPassword2")?.value||"";if(p1.length<8){setErr("新密碼至少需要 8 個字元");return}if(p1!==p2){setErr("兩次輸入的新密碼不一致");return}const {data:{session}}=await client.auth.getSession();if(!session?.access_token){setErr("登入狀態已失效，請重新登入");return}$("hvEntryNext").disabled=true;try{const res=await fetch(ADMIN_API+"/claim-password",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({new_password:p1})});const d=await res.json().catch(()=>({}));if(!res.ok||!d.ok)throw new Error(d.error||"密碼設定失敗");const {data:verify}=await client.from("profiles").select("must_change_password").eq("id",session.user.id).maybeSingle();if(verify?.must_change_password===true)throw new Error("密碼已送出但首次登入狀態尚未解除，請稍後再試");sessionStorage.setItem("hv-force-login-message","密碼設定成功，請使用新密碼重新登入");await window.hvGlobalLogout?.()}catch(e){setErr(e.message||String(e));$("hvEntryNext").disabled=false}}

window.HawkVisionSessionPolicy={
 isPredictionPublic(){
   const i=info();
   const allowed=(i?.pause==="none")?true:coreBetAllowed();
   state.currentPublicBetAllowed=allowed===true;
   return state.currentPublicBetAllowed;
 },
 clearPublicSignal(){state.currentPublicBetAllowed=false;if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested()},
 hasBettableDecision(){return hasBettableDecision()},
 undoLastRound(){return undoLastRoundExact()},
 shouldCountLastResult(){return !!state.lastRoundEvaluationAllowed},
 refreshSuggestion(){if($("hvSuggestedBet"))$("hvSuggestedBet").textContent=displayedSuggested()},
 isBettingActive(){return !!state.bettingActive},
 isAnalysisActive(){return !!state.analysisActive}
};
async function claimDevice(){return rpc("hv_claim_single_device_v1",{p_device_token:state.deviceToken,p_client_name:"analysis"})}
async function poll(){try{const d=await rpc("hv_analysis_live_status_v1",{p_device_token:state.deviceToken});if(d?.device_valid===false){await client.auth.signOut({scope:"local"}).catch(()=>{});location.replace("https://hawkvisionai.com/?session_replaced=1");return}if(Number(d?.password_generation||0)>state.lastPasswordGeneration){sessionStorage.setItem("hv-force-login-message","上層已重置密碼，請聯繫上層");await client.auth.signOut({scope:"local"}).catch(()=>{});location.replace("https://hawkvisionai.com/?password_reset=1");return}if(state.isMember){if(d?.active_until)state.activeUntil=d.active_until;if(Number(d?.hours_generation||0)>state.lastHoursGeneration){state.lastHoursGeneration=Number(d.hours_generation||0);state.activeUntil=null;updateTimeUI();syncStartControls();const banner=$("hvLockBanner");if(banner&&state.setupComplete){banner.textContent="所有時數已被清除，請聯繫上層";banner.classList.add("show")}}}}catch(e){console.warn("analysis live status",e)}}
function hydrate(settings={}){state.setupComplete=settings.setup_completed===true;state.mode=settings.selected_mode||null;state.actualMode=settings.actual_mode||state.mode||"basic";state.modeNotice=settings.mode_notice||"";state.initialPoints=Number(settings.bankroll_base||0);const hasCurrent=settings.current_bankroll!==undefined&&settings.current_bankroll!==null;state.points=Number(settings.current_bankroll??state.initialPoints??0);state.profit=Number(settings.profit||0);normalizePointState(hasCurrent?"points":"profit");const b=settings.betting&&typeof settings.betting==="object"?settings.betting:{};state.family=STYLE_INFO[b.family]?b.family:null;state.method=b.method||null;if(state.method&&!state.family)state.family=methodStyleKey(state.method);if(state.method==="standard")state.family=null;state.noCommission=state.mode==="basic"?false:!!b.no_commission;state.analysisActive=!!b.analysis_active;state.bettingActive=!!b.betting_active;state.progressionIndex=Math.max(0,Number(b.progression_index||0));state.unitPoints=Math.max(0,Number(b.unit_points||0));state.corePause=normalizeCorePause(b.core_pause);state.officialHistory=Array.isArray(b.official_history)?b.official_history:[];state.reverseHundredUsed=!!b.reverse_hundred_used;state.skippedSetup=!!b.skipped_setup}
function clearExpiredMemberRuntime(){
 state.setupComplete=false;state.mode=null;state.family=null;state.method=null;
 state.points=0;state.initialPoints=0;state.profit=0;state.unitPoints=0;
 state.noCommission=false;state.entered=false;state.skippedSetup=false;
 state.editingSettings=false;state.manualEdited=false;state.settingsSnapshot=null;state.pendingSettingsCommit=false;
 state.analysisActive=false;state.bettingActive=false;state.progressionIndex=0;state.officialHistory=[];
 state.actualMode="basic";state.modeNotice="";state.lastRoundEvaluationAllowed=false;state.lastRoundHadSignal=false;
 resetCorePause();resetSkip();window.HawkVisionAnalysisCore?.resetAnalysis?.();
}
// Shoe/runtime lifecycle hard rule:
// - Undo deletes the removed round permanently from current shoe history.
// - Undo below the strategy minimum returns to pre-analysis/pre-betting state, but keeps the actual remaining B/P effective-round count.
// - Closing the page preserves an active shoe while time remains.
// - Logout preserves an active shoe only while time remains; logout at zero time clears immediately.
// - A shoe is also cleared by: new shoe, completed mode/family/method change, or member login with zero remaining time.
async function boot(){beginView("boot");hideAnalysis();const {data:{session}}=await client.auth.getSession();if(!session?.user)return;state.user=session.user;const {data:profile}=await client.from("profiles").select("must_change_password").eq("id",session.user.id).maybeSingle();if(profile?.must_change_password===true){renderPasswordClaim();return}state.deviceToken=token();await claimDevice();const entry=await rpc("hv_analysis_entry_v1",{p_device_token:state.deviceToken});state.role=entry?.business_role||"";state.isMember=state.role==="member";state.modes=state.isMember?(entry?.modes||{basic:true,counting:false,full:false}):{basic:true,counting:true,full:true};state.activeUntil=entry?.active_until||null;state.lastHoursGeneration=Number(entry?.hours_generation||0);state.lastPasswordGeneration=Number(entry?.password_generation||0);hydrate(entry?.settings||{});if(state.method&&!methodInfo[state.method]){state.setupComplete=false;state.method=null;state.family=null;state.points=0;state.initialPoints=0}setupMenu();setupStartButtons();$("hvCommissionInGame")?.addEventListener("click",()=>setCommission(!state.noCommission));window.HawkVisionAnalysisCore?.setStrategy?.(state.method);window.HawkVisionAnalysisCore?.setLookback?.(requiredGames());if(!state.isMember){state.setupComplete=false;state.mode=null;state.family=null;state.method=null;state.points=0;state.initialPoints=0;state.profit=0;state.analysisActive=false;state.bettingActive=false;state.progressionIndex=0;state.officialHistory=[];window.HawkVisionAnalysisCore?.resetAnalysis?.();renderSetup();saveRuntime({}).catch(()=>{})}else if(calcRemaining()<=0){clearExpiredMemberRuntime();renderSetup();await saveRuntime({}).catch(()=>{})}else{if(state.setupComplete&&entry?.analysis_state)window.HawkVisionAnalysisCore?.importState?.(entry.analysis_state);renderSetup()}updateTimeUI();const scheduleClock=()=>{updateTimeUI();syncStartControls();const delay=Math.max(80,1000-(Date.now()%1000)+20);tickTimer=setTimeout(scheduleClock,delay)};scheduleClock();pollTimer=setInterval(poll,POLL_MS)}
const wait=setInterval(()=>{if(document.body.classList.contains("hv-auth-ready")){clearInterval(wait);boot().catch(e=>{console.error(e);showShell();hideAnalysis();setErr("分析入口初始化失敗："+(e.message||e))})}},50);
})();
