(() => {
"use strict";
const VERSION="3.3.2";
const POLL_MS=1500;
const ADMIN_API="https://hawkvision-admin-api.michael19941009.workers.dev";
const client=window.hvAnalysisAuthClient;
if(!client)return;
const $=id=>document.getElementById(id);
const state={step:0,user:null,isMember:false,role:"",modes:{basic:true,counting:false,full:false},selectedMode:null,bankrollBase:null,currentBankroll:null,profit:0,betting:null,remaining:0,activeUntil:null,setupComplete:false,deviceToken:"",hourHistory:[],hourInventory:[],lastHoursGeneration:0,lastPasswordGeneration:0,editAction:null,passwordClaim:false};
let tickTimer=null,pollTimer=null,saveTimer=null;
const cookieName="hv-device-token";
function cookieGet(name){const p=name+"=";const r=document.cookie.split("; ").find(v=>v.startsWith(p));return r?decodeURIComponent(r.slice(p.length)):""}
function cookieSet(name,value){document.cookie=`${name}=${encodeURIComponent(value)}; Domain=.hawkvisionai.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure`}
function token(){let t=cookieGet(cookieName);if(!t){t=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);cookieSet(cookieName,t)}return t}
function fmtSec(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function money(v){return Number(v||0).toLocaleString("zh-TW")}
function showShell(){$("hvEntryShell")?.classList.add("show")}
function hideShell(){$("hvEntryShell")?.classList.remove("show")}
function showAnalysis(){document.body.classList.add("hv-analysis-visible")}
function hideAnalysis(){document.body.classList.remove("hv-analysis-visible")}
function setErr(m=""){if($("hvEntryError"))$("hvEntryError").textContent=m}
async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data}
function calcRemaining(){if(!state.isMember)return 0;if(!state.activeUntil)return 0;return Math.max(0,Math.floor((new Date(state.activeUntil).getTime()-Date.now())/1000))}
function updateTimeUI(){
  if(!state.isMember){$("hvMemberTimeBlock")?.classList.remove("show");if($("hvMenuRemainingTime"))$("hvMenuRemainingTime").style.display="none";applyTimeLock();return}
  state.remaining=calcRemaining();const t=fmtSec(state.remaining);
  $("hvMemberTimeBlock")?.classList.add("show");if($("hvRemainingTimeTop"))$("hvRemainingTimeTop").textContent=t;
  if($("hvMenuRemainingTime")){ $("hvMenuRemainingTime").style.display="block"; $("hvMenuRemainingTime").textContent=`剩餘時間 ${t}`; }
  applyTimeLock();
}
function applyTimeLock(){const locked=state.isMember&&state.setupComplete&&state.remaining<=0;document.body.classList.toggle("hv-time-locked",locked);$("hvLockBanner")?.classList.toggle("show",locked);document.querySelectorAll('#hvFunctionPopover [data-hv-fn]').forEach(b=>{const fn=b.dataset.hvFn;b.disabled=locked&&!["hours","logout"].includes(fn)});}
function renderRuntime(){
  const anyBank=state.bankrollBase!=null;
  $("hvResultMoney")?.classList.toggle("show",anyBank);
  if($("hvBankrollChip"))$("hvBankrollChip").textContent=anyBank?money(state.currentBankroll):"—";
  if($("hvProfitChip"))$("hvProfitChip").textContent=anyBank?`${state.profit>=0?"+":""}${money(state.profit)}`:"—";
  updateTimeUI();
}
function serializeSettings(){return {setup_completed:state.setupComplete,selected_mode:state.selectedMode,bankroll_base:state.bankrollBase,current_bankroll:state.currentBankroll,profit:state.profit,betting:state.betting,screen:"analysis"}}
function queueSave(analysisState){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveRuntime(analysisState).catch(()=>{}),250)}
window.hvAnalysisRuntimeSave=(analysisState)=>queueSave(analysisState);
async function saveRuntime(analysisState){if(!state.user)return;await rpc("hv_analysis_save_runtime_v1",{p_device_token:state.deviceToken,p_settings:serializeSettings(),p_analysis_state:analysisState||window.HawkVisionAnalysisCore?.exportState?.()||{}})}
function isModeSelectable(k){if(k==="basic")return state.modes.basic!==false;return false;}

function prepareEntryButtons(){const back=$("hvEntryBack"),skip=$("hvEntrySkip"),next=$("hvEntryNext");back.style.display=state.step===0?"none":"inline-block";next.style.display="inline-block";skip.style.display="inline-block";skip.textContent="跳過";next.textContent="下一步";}
function renderStep(){
  showShell();hideAnalysis();setErr("");prepareEntryButtons();
  const title=$("hvEntryTitle"),hint=$("hvEntryHint"),body=$("hvEntryBody"),back=$("hvEntryBack"),skip=$("hvEntrySkip"),next=$("hvEntryNext");
  if(state.step===0){
    title.textContent="分析模式選擇";hint.textContent="依上層開放的模式選擇本次分析方式；也可以跳過，跳過後系統以基礎分析運作，但不顯示目前模式。";
    const defs=[["basic","基礎模式","依最近牌局結果進行基礎分析"],["counting","算牌模式","權限已預留；正式算牌畫面完成後啟用"],["full","完整模式","權限已預留；完整分析規則完成後啟用"]];
    body.innerHTML=`<div class="hv-mode-list">${defs.map(([k,n,d])=>{const granted=state.modes[k]===true,ready=k==="basic",disabled=!granted||!ready;const msg=!granted?"上層尚未開放":d;return `<button class="hv-mode-option ${state.selectedMode===k?"selected":""}" data-mode="${k}" ${disabled?"disabled":""} type="button"><strong>${n}</strong><small>${msg}</small></button>`}).join("")}</div>`;
    body.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{state.selectedMode=b.dataset.mode;renderStep()});
  }else if(state.step===1){
    title.textContent="預計使用本金";hint.textContent="本金只是本次分析與後續配注的臨時基準，與管理平台額度及時數包完全無關。";
    body.innerHTML=`<div class="hv-field"><label>本次起始本金</label><input id="hvBankrollInput" type="number" min="1" step="1" inputmode="numeric" placeholder="例如 10000" value="${state.bankrollBase??""}"></div>`;
  }else if(state.step===2){
    title.textContent="配注方式";hint.textContent="配注方式只影響建議下注金額；目前細項規則尚未定案，可先跳過。";
    body.innerHTML=`<div class="hv-empty">配注方式與細項規則將在下一階段加入。<br>目前請選擇「跳過」。</div>`;next.style.display="none";
  }else{renderHoursStep();}
  if(state.editAction){back.style.display="none";if(state.editAction==="hours")skip.textContent="關閉";}
}

async function loadHours(){
  if(!state.isMember){state.hourInventory=[];state.hourHistory=[];return}
  const d=await rpc("hv_analysis_member_hours_v1");
  state.hourInventory=Array.isArray(d?.available)?d.available:[];state.hourHistory=Array.isArray(d?.used)?d.used:[];
  state.activeUntil=d?.active_until||state.activeUntil;state.lastHoursGeneration=Number(d?.generation??state.lastHoursGeneration);return d;
}
async function renderHoursStep(){
  showShell();hideAnalysis();setErr("");
  const title=$("hvEntryTitle"),hint=$("hvEntryHint"),body=$("hvEntryBody"),back=$("hvEntryBack"),skip=$("hvEntrySkip"),next=$("hvEntryNext");
  title.textContent="時數包";back.style.display=state.editAction?"none":"inline-block";next.style.display="none";skip.style.display="inline-block";skip.textContent=state.editAction?"關閉":"進入分析畫面";
  if(!state.isMember){hint.textContent="管理層不需要開啟時數包。";body.innerHTML='<div class="hv-empty">可直接進入分析畫面。</div>';return}
  hint.textContent="開啟後即以絕對時間持續倒數；離線、登出、關閉頁面或換裝置都不會停止。";
  body.innerHTML='<div class="hv-empty">正在載入時數包…</div>';
  try{
    const d=await loadHours();state.remaining=calcRemaining();
    const avail=state.hourInventory.filter(x=>Number(x.available_count)>0);
    const used=state.hourHistory.filter(x=>Number(x.used_count)>0);
    body.innerHTML=`<div class="hv-time-big">${fmtSec(state.remaining)}</div><h3>可使用時數包</h3>${avail.length?`<div class="hv-hour-list">${avail.map(x=>`<button class="hv-hour-option" data-hour="${Number(x.hours_per_package)}" type="button"><strong>${Number(x.hours_per_package)} 小時</strong><small>可使用 ${Number(x.available_count)} 包</small></button>`).join("")}</div>`:'<div class="hv-empty">目前沒有可使用時數包<br>請跟上層索取時數包</div>'}<h3 style="margin-top:18px">已使用紀錄</h3><div class="hv-history-row"><span>累計使用總時間</span><strong>${Number(d?.total_activated_hours||0)} 小時</strong></div><div class="hv-used-scroll">${used.length?used.map(x=>`<div class="hv-history-row"><span>${Number(x.hours_per_package)} 小時時數包</span><strong>${Number(x.used_count)} 包</strong></div>`).join(""):'<div class="hv-empty">尚無使用紀錄</div>'}</div>`;
    body.querySelectorAll("[data-hour]").forEach(b=>b.onclick=async()=>{b.disabled=true;setErr("");try{const r=await rpc("hv_analysis_activate_hour_package_v1",{p_hours_per_package:Number(b.dataset.hour)});state.activeUntil=r?.active_until||state.activeUntil;await renderHoursStep();updateTimeUI()}catch(e){setErr(e.message||String(e));b.disabled=false}});
  }catch(e){body.innerHTML='<div class="hv-empty">時數包讀取失敗</div>';setErr(e.message||String(e))}
}

function finishSetup(){state.setupComplete=true;hideShell();showAnalysis();renderRuntime();saveRuntime().catch(()=>{});}
async function next(){
  setErr("");
  if(state.passwordClaim)return submitPasswordClaim();
  if(state.editAction==="mode"){if(!state.selectedMode||!isModeSelectable(state.selectedMode)){setErr("請選擇目前可使用的模式");return}if(!confirm("確定變更模式？目前牌局、珠盤路、分析結果與正確率都會清除；本金與配注方式會保留。"))return;window.HawkVisionAnalysisCore?.resetAnalysis?.();state.setupComplete=true;state.editAction=null;hideShell();showAnalysis();renderRuntime();await saveRuntime({});return}
  if(state.editAction==="bankroll"){const v=$("hvBankrollInput")?.value.trim();if(!v||Number(v)<=0){setErr("請輸入大於 0 的本金");return}state.bankrollBase=Number(v);state.currentBankroll=Number(v);state.profit=0;state.editAction=null;hideShell();showAnalysis();renderRuntime();await saveRuntime();return}
  if(state.step===0){if(state.selectedMode&&!isModeSelectable(state.selectedMode)){setErr("此模式正式畫面尚未接入");return}state.step=1;renderStep();return}
  if(state.step===1){const v=$("hvBankrollInput")?.value.trim();if(v){const n=Number(v);if(!Number.isFinite(n)||n<=0){setErr("本金必須大於 0");return}state.bankrollBase=n;state.currentBankroll=n;state.profit=0}else state.bankrollBase=state.currentBankroll=null;state.step=2;renderStep();return}
}
function skip(){
  if(state.passwordClaim)return;
  if(state.editAction){hideShell();showAnalysis();state.editAction=null;return}
  if(state.step===0){state.selectedMode=null;state.step=1;renderStep();return}
  if(state.step===1){state.bankrollBase=state.currentBankroll=null;state.profit=0;state.step=2;renderStep();return}
  if(state.step===2){state.betting=null;if(state.isMember){state.step=3;renderStep()}else finishSetup();return}
  if(state.step===3){finishSetup()}
}
function back(){if(state.passwordClaim)return;if(state.editAction){hideShell();showAnalysis();state.editAction=null;return}if(state.step>0){state.step--;renderStep()}}
function changeMode(){state.step=0;state.editAction="mode";renderStep();state.editAction="mode";$("hvEntrySkip").style.display="none";$("hvEntryNext").textContent="套用變更"}
function changeBankroll(){state.step=1;state.editAction="bankroll";renderStep();state.editAction="bankroll";$("hvEntrySkip").style.display="none";$("hvEntryNext").textContent="儲存本金"}
function changeBetting(){state.step=2;state.editAction="betting";renderStep();state.editAction="betting";$("hvEntrySkip").textContent="關閉";$("hvEntryNext").style.display="none"}
function openHours(){state.step=3;state.editAction="hours";renderHoursStep()}
function setupMenu(){const btn=$("hvFunctionBtn"),pop=$("hvFunctionPopover");btn?.addEventListener("click",e=>{e.stopPropagation();pop.classList.toggle("show")});document.addEventListener("click",e=>{if(pop?.classList.contains("show")&&!pop.contains(e.target)&&e.target!==btn)pop.classList.remove("show")});pop?.querySelectorAll("[data-hv-fn]").forEach(b=>b.addEventListener("click",async()=>{pop.classList.remove("show");const fn=b.dataset.hvFn;if(fn==="hours")openHours();else if(fn==="mode")changeMode();else if(fn==="bankroll")changeBankroll();else if(fn==="betting")changeBetting();else if(fn==="platforms")location.href="https://hawkvisionai.com/";else if(fn==="logout"){if(state.isMember&&calcRemaining()<=0){state.setupComplete=false;state.selectedMode=null;state.bankrollBase=state.currentBankroll=null;state.profit=0;state.betting=null;window.HawkVisionAnalysisCore?.resetAnalysis?.();await saveRuntime({}).catch(()=>{})}await window.hvGlobalLogout?.()}}));}
async function claimDevice(){return rpc("hv_claim_single_device_v1",{p_device_token:state.deviceToken,p_client_name:"analysis"})}

function renderPasswordClaim(){
  state.passwordClaim=true;showShell();hideAnalysis();setErr("");
  $("hvEntryTitle").textContent="首次登入｜設定新密碼";$("hvEntryHint").textContent="第一次登入必須先設定自己的新密碼；設定成功後系統會登出，請使用新密碼重新登入。";
  $("hvEntryBody").innerHTML='<div class="hv-field"><label>新密碼</label><div class="hv-password-wrap"><input id="hvNewPassword" type="password" autocomplete="new-password" placeholder="至少 8 個字元"><button class="hv-password-toggle" type="button" data-password-target="hvNewPassword">顯示</button></div></div><div class="hv-field"><label>再次輸入新密碼</label><div class="hv-password-wrap"><input id="hvNewPassword2" type="password" autocomplete="new-password" placeholder="再次輸入新密碼"><button class="hv-password-toggle" type="button" data-password-target="hvNewPassword2">顯示</button></div></div>';
  $("hvEntryBody").querySelectorAll("[data-password-target]").forEach(btn=>btn.addEventListener("click",()=>{const input=$(btn.dataset.passwordTarget);if(!input)return;const showing=input.type==="text";input.type=showing?"password":"text";btn.textContent=showing?"顯示":"隱藏";}));
  $("hvEntryBack").style.display="none";$("hvEntrySkip").style.display="none";$("hvEntryNext").style.display="inline-block";$("hvEntryNext").textContent="設定新密碼並重新登入";
}
async function submitPasswordClaim(){
  const p1=$("hvNewPassword")?.value||"",p2=$("hvNewPassword2")?.value||"";if(p1.length<8){setErr("新密碼至少需要 8 個字元");return}if(p1!==p2){setErr("兩次輸入的新密碼不一致");return}
  const {data:{session}}=await client.auth.getSession();if(!session?.access_token){setErr("登入狀態已失效，請重新登入");return}
  $("hvEntryNext").disabled=true;
  try{const res=await fetch(ADMIN_API+"/claim-password",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({new_password:p1})});const d=await res.json().catch(()=>({}));if(!res.ok||!d.ok)throw new Error(d.error||"密碼設定失敗");sessionStorage.setItem("hv-force-login-message","密碼設定成功，請使用新密碼重新登入");await window.hvGlobalLogout?.()}catch(e){setErr(e.message||String(e));$("hvEntryNext").disabled=false}
}

async function poll(){try{const d=await rpc("hv_analysis_live_status_v1",{p_device_token:state.deviceToken});if(d?.device_valid===false){await client.auth.signOut({scope:"local"}).catch(()=>{});location.replace("https://hawkvisionai.com/?session_replaced=1");return}if(Number(d?.password_generation||0)>state.lastPasswordGeneration){sessionStorage.setItem("hv-force-login-message","上層已重置密碼，請聯繫上層");await client.auth.signOut({scope:"local"}).catch(()=>{});location.replace("https://hawkvisionai.com/?password_reset=1");return}if(state.isMember){state.activeUntil=d?.active_until||null;if(Number(d?.hours_generation||0)>state.lastHoursGeneration){state.lastHoursGeneration=Number(d.hours_generation||0);state.activeUntil=null;showShell();hideAnalysis();state.step=3;state.editAction="hours";await renderHoursStep();setErr("所有時數已被清除，請聯繫上層")}updateTimeUI()}}catch(e){console.warn("analysis live status",e)}}
async function boot(){
  hideAnalysis();
  const {data:{session}}=await client.auth.getSession();if(!session?.user)return;state.user=session.user;
  const {data:profile}=await client.from("profiles").select("must_change_password").eq("id",session.user.id).maybeSingle();
  if(profile?.must_change_password===true){renderPasswordClaim();return}
  state.deviceToken=token();await claimDevice();const entry=await rpc("hv_analysis_entry_v1",{p_device_token:state.deviceToken});state.role=entry?.business_role||"";state.isMember=state.role==="member";state.modes=state.isMember?(entry?.modes||{basic:true,counting:false,full:false}):{basic:true,counting:true,full:true};state.activeUntil=entry?.active_until||null;state.lastHoursGeneration=Number(entry?.hours_generation||0);state.lastPasswordGeneration=Number(entry?.password_generation||0);
  const settings=entry?.settings||{};state.setupComplete=settings.setup_completed===true;state.selectedMode=settings.selected_mode||null;state.bankrollBase=settings.bankroll_base??null;state.currentBankroll=settings.current_bankroll??state.bankrollBase;state.profit=Number(settings.profit||0);state.betting=settings.betting??null;
  const platformBtn=document.querySelector('[data-hv-fn="platforms"]');if(platformBtn)platformBtn.style.display=state.isMember?"none":"block";setupMenu();
  if(state.setupComplete&&(!state.isMember||calcRemaining()>0)){hideShell();showAnalysis();renderRuntime();if(entry?.analysis_state)window.HawkVisionAnalysisCore?.importState?.(entry.analysis_state)}else{state.step=0;state.editAction=null;renderStep()}
  updateTimeUI();tickTimer=setInterval(updateTimeUI,1000);pollTimer=setInterval(poll,POLL_MS);
}
$("hvEntryNext")?.addEventListener("click",next);$("hvEntrySkip")?.addEventListener("click",skip);$("hvEntryBack")?.addEventListener("click",back);
const wait=setInterval(()=>{if(document.body.classList.contains("hv-auth-ready")){clearInterval(wait);boot().catch(e=>{console.error(e);showShell();hideAnalysis();setErr("分析入口初始化失敗："+(e.message||e))})}},50);
})();
