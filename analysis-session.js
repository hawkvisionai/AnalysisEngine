(() => {
"use strict";
const VERSION="3.3.0";
const POLL_MS=1500;
const client=window.hvAnalysisAuthClient;
if(!client)return;
const $=id=>document.getElementById(id);
const state={step:0,user:null,isMember:false,role:"",modes:{basic:true,counting:false,full:false},selectedMode:null,bankrollBase:null,currentBankroll:null,profit:0,betting:null,remaining:0,activeUntil:null,setupComplete:false,deviceToken:"",runtimeLoaded:false,hourHistory:[],hourInventory:[],lastHoursGeneration:0,lastPasswordGeneration:0,editAction:null};
let tickTimer=null,pollTimer=null,saveTimer=null;
const cookieName="hv-device-token";
function cookieGet(name){const p=name+"=";const r=document.cookie.split("; ").find(v=>v.startsWith(p));return r?decodeURIComponent(r.slice(p.length)):""}
function cookieSet(name,value){document.cookie=`${name}=${encodeURIComponent(value)}; Domain=.hawkvisionai.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure`}
function token(){let t=cookieGet(cookieName);if(!t){t=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);cookieSet(cookieName,t)}return t}
function fmtSec(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function money(v){return Number(v||0).toLocaleString("zh-TW")}
function modeLabel(k){return k==="counting"?"算牌模式":k==="full"?"完整模式":"基礎模式"}
function showShell(){ $("hvEntryShell")?.classList.add("show") }
function hideShell(){ $("hvEntryShell")?.classList.remove("show") }
function setErr(m=""){if($("hvEntryError"))$("hvEntryError").textContent=m}
async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data}
function calcRemaining(){if(!state.isMember)return 999999999;if(!state.activeUntil)return 0;return Math.max(0,Math.floor((new Date(state.activeUntil).getTime()-Date.now())/1000))}
function updateTimeUI(){state.remaining=calcRemaining();const t=state.isMember?fmtSec(state.remaining):"管理層免時數";if($("hvRemainingTimeTop"))$("hvRemainingTimeTop").textContent=t;if($("hvMenuRemainingTime"))$("hvMenuRemainingTime").textContent=t;applyTimeLock()}
function applyTimeLock(){const locked=state.isMember&&state.setupComplete&&state.remaining<=0;document.body.classList.toggle("hv-time-locked",locked);$("hvLockBanner")?.classList.toggle("show",locked);document.querySelectorAll('#hvFunctionPopover [data-hv-fn]').forEach(b=>{const fn=b.dataset.hvFn;b.disabled=locked&&!["hours","logout"].includes(fn)});}
function renderRuntimeBar(){const anyMode=!!state.selectedMode, anyBank=state.bankrollBase!=null;$("hvRuntimeBar")?.classList.add("show");$("hvModeChip").style.display=anyMode?"inline-flex":"none";$("hvModeChip").textContent=anyMode?`模式：${modeLabel(state.selectedMode)}`:"";$("hvBankrollChip").style.display=anyBank?"inline-flex":"none";$("hvBankrollChip").textContent=anyBank?`目前本金：${money(state.currentBankroll)}`:"";$("hvProfitChip").style.display=anyBank?"inline-flex":"none";$("hvProfitChip").textContent=anyBank?`目前輸贏：${state.profit>=0?"+":""}${money(state.profit)}`:"";updateTimeUI();}
function serializeSettings(){return {setup_completed:state.setupComplete,selected_mode:state.selectedMode,bankroll_base:state.bankrollBase,current_bankroll:state.currentBankroll,profit:state.profit,betting:state.betting,screen:"analysis"}}
function queueSave(analysisState){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveRuntime(analysisState).catch(()=>{}),250)}
window.hvAnalysisRuntimeSave=(analysisState)=>queueSave(analysisState);
async function saveRuntime(analysisState){if(!state.user)return;await rpc("hv_analysis_save_runtime_v1",{p_device_token:state.deviceToken,p_settings:serializeSettings(),p_analysis_state:analysisState||window.HawkVisionAnalysisCore?.exportState?.()||{}})}
function isModeSelectable(k){
  if(k==="basic")return state.modes.basic!==false;
  // v3.3.0 先完成入口/權限框架；算牌與完整正式畫面尚未接入，避免誤用基礎演算法冒充。
  return false;
}
function renderStep(){
  showShell();setErr("");state.editAction=null;
  const title=$("hvEntryTitle"),hint=$("hvEntryHint"),body=$("hvEntryBody"),back=$("hvEntryBack"),skip=$("hvEntrySkip"),next=$("hvEntryNext");
  back.style.display=state.step===0?"none":"inline-block";next.style.display="inline-block";skip.style.display="inline-block";skip.textContent="跳過";next.textContent="下一步";
  if(state.step===0){
    title.textContent="分析模式選擇";hint.textContent="依上層開放的模式選擇本次分析方式；也可以跳過，跳過後系統以基礎分析運作，但不顯示目前模式。";
    const defs=[["basic","基礎模式","依最近牌局結果進行基礎分析"],["counting","算牌模式","權限框架已完成；正式算牌畫面尚未接入"],["full","完整模式","權限框架已完成；完整分析規則尚在研究"]];
    body.innerHTML=`<div class="hv-mode-list">${defs.map(([k,n,d])=>{const granted=state.modes[k]===true,ready=k==="basic",disabled=!granted||!ready;const msg=!granted?"上層尚未開放":(!ready?d:d);return `<button class="hv-mode-option ${state.selectedMode===k?"selected":""}" data-mode="${k}" ${disabled?"disabled":""} type="button"><strong>${n}</strong><small>${msg}</small></button>`}).join("")}</div>`;
    body.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{state.selectedMode=b.dataset.mode;renderStep()});
  }else if(state.step===1){
    title.textContent="預計使用本金";hint.textContent="本金只是本次分析與後續配注的臨時基準，與管理平台額度及時數包完全無關。";body.innerHTML=`<div class="hv-field"><label>本次起始本金</label><input id="hvBankrollInput" type="number" min="1" step="1" inputmode="numeric" placeholder="例如 10000" value="${state.bankrollBase??""}"></div>`;
  }else if(state.step===2){
    title.textContent="配注方式";hint.textContent="配注方式只影響建議下注金額；目前細項規則尚未定案，可先跳過。";body.innerHTML=`<div class="hv-empty">配注方式與細項規則將在下一階段加入。<br>目前請選擇「跳過」。</div>`;next.style.display="none";
  }else{renderHoursStep();}
}
function finishSetup(){state.setupComplete=true;hideShell();renderRuntimeBar();saveRuntime().catch(()=>{});}
async function next(){
  setErr("");
  if(state.editAction==="mode"){if(!state.selectedMode||!isModeSelectable(state.selectedMode)){setErr("請選擇目前可使用的模式");return}if(!confirm("確定變更模式？目前牌局、珠盤路、分析結果與正確率都會清除；本金與配注方式會保留。"))return;window.HawkVisionAnalysisCore?.resetAnalysis?.();state.setupComplete=true;state.editAction=null;hideShell();renderRuntimeBar();await saveRuntime({});return}
  if(state.editAction==="bankroll"){const v=$("hvBankrollInput")?.value.trim();if(!v||Number(v)<=0){setErr("請輸入大於 0 的本金");return}state.bankrollBase=Number(v);state.currentBankroll=Number(v);state.profit=0;state.editAction=null;hideShell();renderRuntimeBar();await saveRuntime();return}
  if(state.step===0){if(state.selectedMode && !isModeSelectable(state.selectedMode)){setErr("此模式正式畫面尚未接入");return}state.step=1;renderStep();return}
  if(state.step===1){const v=$("hvBankrollInput")?.value.trim();if(v){const n=Number(v);if(!Number.isFinite(n)||n<=0){setErr("本金必須大於 0");return}state.bankrollBase=n;state.currentBankroll=n;state.profit=0}else state.bankrollBase=state.currentBankroll=null;state.step=2;renderStep();return}
}
function skip(){if(state.editAction){hideShell();state.editAction=null;return}if(state.step===0){state.selectedMode=null;state.step=1;renderStep();return}if(state.step===1){state.bankrollBase=state.currentBankroll=null;state.profit=0;state.step=2;renderStep();return}if(state.step===2){state.betting=null;state.step=3;renderStep();return}if(state.step===3){if(state.isMember&&calcRemaining()<=0){hideShell();state.setupComplete=true;renderRuntimeBar();saveRuntime().catch(()=>{});return}finishSetup()}}
function back(){if(state.editAction){hideShell();state.editAction=null;return}if(state.step>0){state.step--;renderStep()}}
function changeMode(){state.step=0;state.editAction="mode";showShell();renderStep();state.editAction="mode";$("hvEntrySkip").style.display="none";$("hvEntryBack").style.display="none";$("hvEntryNext").textContent="套用變更"}
function changeBankroll(){state.step=1;state.editAction="bankroll";showShell();renderStep();state.editAction="bankroll";$("hvEntrySkip").style.display="none";$("hvEntryBack").style.display="none";$("hvEntryNext").textContent="儲存本金"}
function changeBetting(){state.step=2;state.editAction="betting";showShell();renderStep();state.editAction="betting";$("hvEntrySkip").textContent="關閉";$("hvEntryNext").style.display="none"}
function openHours(){state.step=3;state.editAction="hours";renderStep();$("hvEntrySkip").textContent="關閉"}
function setupMenu(){const btn=$("hvFunctionBtn"),pop=$("hvFunctionPopover");btn?.addEventListener("click",()=>pop.classList.toggle("show"));document.addEventListener("click",e=>{if(pop?.classList.contains("show")&&!pop.contains(e.target)&&e.target!==btn)pop.classList.remove("show")});pop?.querySelectorAll("[data-hv-fn]").forEach(b=>b.addEventListener("click",async()=>{pop.classList.remove("show");const fn=b.dataset.hvFn;if(fn==="hours")openHours();else if(fn==="mode")changeMode();else if(fn==="bankroll")changeBankroll();else if(fn==="betting")changeBetting();else if(fn==="platforms")location.href="https://hawkvisionai.com/";else if(fn==="logout")await window.hvGlobalLogout?.()}));}
async function claimDevice(){const d=await rpc("hv_claim_single_device_v1",{p_device_token:state.deviceToken,p_client_name:"analysis"});return d}
async function poll(){try{const d=await rpc("hv_analysis_live_status_v1",{p_device_token:state.deviceToken});if(d?.device_valid===false){await client.auth.signOut({scope:"local"}).catch(()=>{});location.replace("https://hawkvisionai.com/?session_replaced=1");return}if(Number(d?.password_generation||0)>state.lastPasswordGeneration){sessionStorage.setItem("hv-force-login-message","上層已重置密碼，請聯繫上層");await client.auth.signOut({scope:"local"}).catch(()=>{});location.replace("https://hawkvisionai.com/?password_reset=1");return}if(state.isMember){state.activeUntil=d?.active_until||null;if(Number(d?.hours_generation||0)>state.lastHoursGeneration){state.lastHoursGeneration=Number(d.hours_generation||0);state.activeUntil=null;showShell();state.step=3;await renderHoursStep();setErr("所有時數已被清除，請聯繫上層");}updateTimeUI()}}catch(e){console.warn("analysis live status",e)}}
async function boot(){const {data:{session}}=await client.auth.getSession();if(!session?.user)return;state.user=session.user;state.deviceToken=token();await claimDevice();const entry=await rpc("hv_analysis_entry_v1",{p_device_token:state.deviceToken});state.role=entry?.business_role||"";state.isMember=state.role==="member";state.modes=state.isMember?(entry?.modes||{basic:true,counting:false,full:false}):{basic:true,counting:true,full:true};state.activeUntil=entry?.active_until||null;state.lastHoursGeneration=Number(entry?.hours_generation||0);state.lastPasswordGeneration=Number(entry?.password_generation||0);const settings=entry?.settings||{};state.setupComplete=settings.setup_completed===true;state.selectedMode=settings.selected_mode||null;state.bankrollBase=settings.bankroll_base??null;state.currentBankroll=settings.current_bankroll??state.bankrollBase;state.profit=Number(settings.profit||0);state.betting=settings.betting??null;const platformBtn=document.querySelector('[data-hv-fn="platforms"]');if(platformBtn)platformBtn.style.display=state.isMember?"none":"block";setupMenu();if(state.setupComplete && (!state.isMember||calcRemaining()>0)){renderRuntimeBar();hideShell();if(entry?.analysis_state)window.HawkVisionAnalysisCore?.importState?.(entry.analysis_state)}else{state.step=0;renderStep()}updateTimeUI();tickTimer=setInterval(updateTimeUI,1000);pollTimer=setInterval(poll,POLL_MS)}
$("hvEntryNext")?.addEventListener("click",next);$("hvEntrySkip")?.addEventListener("click",skip);$("hvEntryBack")?.addEventListener("click",back);
const wait=setInterval(()=>{if(document.body.classList.contains("hv-auth-ready")){clearInterval(wait);boot().catch(e=>{console.error(e);showShell();setErr("分析入口初始化失敗："+(e.message||e))})}},100);
})();
