
const BRAND_INTRO_DELAY_MS = 2000;
const BRAND_INTRO_FAILSAFE_MS = 4200;

function forceFinishBrandIntro(){
  const intro=document.getElementById("brandIntro");
  document.querySelectorAll(".brand-flying-logo").forEach(el=>el.remove());
  if(intro) intro.remove();
  document.body.classList.remove("brand-intro-active","brand-target-layout");
  document.body.classList.add("brand-ready");
  const headerLogo=document.querySelector(".header-logo");
  if(headerLogo) headerLogo.style.visibility="visible";
}

function finishBrandIntro(){
  const intro=document.getElementById("brandIntro");
  const introWrap=intro?.querySelector(".intro-logo-wrap");
  const introLogo=intro?.querySelector(".intro-logo");
  const headerLogo=document.querySelector(".header-logo");

  if(!intro||!introWrap||!introLogo||!headerLogo){
    forceFinishBrandIntro();
    return;
  }

  document.body.classList.remove("brand-intro-active");
  document.body.classList.add("brand-target-layout");

  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const start=introLogo.getBoundingClientRect();
    const target=headerLogo.getBoundingClientRect();

    const flyer=document.createElement("img");
    flyer.src=headerLogo.src;
    flyer.alt="";
    flyer.className="brand-flying-logo";
    Object.assign(flyer.style,{left:`${start.left}px`,top:`${start.top}px`,width:`${start.width}px`,height:`${start.height}px`});
    document.body.appendChild(flyer);
    introWrap.style.opacity="0";

    const lift=Math.max(22,Math.min(58,start.height*.12));
    const midLeft=start.left+(target.left-start.left)*.58;
    const midTop=start.top+(target.top-start.top)*.42-lift;
    const midWidth=start.width+(target.width-start.width)*.66;
    const midHeight=start.height+(target.height-start.height)*.66;

    let completed=false;
    const complete=()=>{
      if(completed)return;
      completed=true;
      headerLogo.style.visibility="visible";
      flyer.remove();
      intro.classList.add("is-leaving");
      document.body.classList.remove("brand-target-layout");
      document.body.classList.add("brand-ready");
      setTimeout(()=>intro.remove(),500);
    };

    // 改用 CSS transition，iPhone／LINE 內建瀏覽器較穩定。
    Object.assign(flyer.style,{
      transition:[
        "left 580ms cubic-bezier(.22,.8,.24,1)",
        "top 580ms cubic-bezier(.22,.8,.24,1)",
        "width 580ms cubic-bezier(.22,.8,.24,1)",
        "height 580ms cubic-bezier(.22,.8,.24,1)",
        "filter 580ms ease"
      ].join(","),
      willChange:"left,top,width,height,filter"
    });

    setTimeout(()=>document.body.classList.add("brand-ready"),250);

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      Object.assign(flyer.style,{
        left:`${target.left}px`,
        top:`${target.top}px`,
        width:`${target.width}px`,
        height:`${target.height}px`,
        filter:"drop-shadow(0 0 10px rgba(139,92,246,.22))"
      });
    }));

    flyer.addEventListener("transitionend",complete,{once:true});
    setTimeout(complete,900);
  }));
}

window.addEventListener("load",()=>{
  const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(finishBrandIntro,reduceMotion?900:BRAND_INTRO_DELAY_MS);
});

setTimeout(forceFinishBrandIntro,BRAND_INTRO_FAILSAFE_MS);

const APP_BUILD="16.9";
console.info("HawkVision Record Studio build",APP_BUILD);
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://rwxujvpakpemiwkitltk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aN_1_fzAV3hR6FmW7FTZGg_6SF0MUHF";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const USER_ADMIN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/manage-users`;
const AI_CAPTURE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/analyze-capture`;
const $ = id => document.getElementById(id);

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const DEFAULT_VENUE_KEY = "baccarat_default_venue";
const LOCAL_VENUES_KEY = "baccarat_local_venues";

let currentShoe = null;
let currentGames = [];
let busy = false;
let mode = "complete";
let inputMethod = "manual";
let aiCapture = freshAiCapture();
let cameraStream = null;
let lastSavedCameraResult = "";
let venueOptions = [];
let allShoes = [];
let editingShoe = null;
let cardState = freshCardState();
let winnerOnlyState = freshWinnerOnlyState();
let currentUser = null;
let currentProfile = null;
let managedUsers = [];
let realtimeChannels = [];
let realtimeReloadTimer = null;
let realtimeManagerTimer = null;
let realtimeReconnectTimer = null;
let realtimeGeneration = 0;
let realtimeJoinedCount = 0;
let onlineProfiles = new Map();
let dashboardData = null;
let dashboardRefreshTimer = null;
let finishedHistoryData = [];
let personnelStatsData = [];
let selectedPersonnel = null;
let myRecentShoesData = [];
let aiCorrected = false;
let managementListData = [];
let managementListType = "";
let managementGamesOffset = 0;

const loginPanel = $("loginPanel");
const appPanel = $("appPanel");
const logoutButton = $("logoutButton");
const loginMessage = $("loginMessage");
const appMessage = $("appMessage");
const userArea = $("userArea");

function freshCardState(){
  return { player:[null,null,null], banker:[null,null,null], active:"playerInitial" };
}
function freshWinnerOnlyState(){
  return { winner:null, playerPair:false, bankerPair:false, superSix:false };
}
function freshAiCapture(){
  return {
    file:null, objectUrl:null, editing:null, recognizing:false, warning:"",
    expectedPlayerPoints:null, expectedBankerPoints:null,
    autoSlots:{player:[false,false,false],banker:[false,false,false]},
    confirmed:{player:[false,false,false],banker:[false,false,false]},
    diagnostics:null, reviewRequired:false
  };
}
function aiAllowed(){ return currentProfile?.role==="admin" || currentProfile?.ai_capture_enabled===true; }
function releaseAiPhoto(){
  if(aiCapture.objectUrl) URL.revokeObjectURL(aiCapture.objectUrl);
  aiCapture=freshAiCapture();

}
function resetAiCapture(){ releaseAiPhoto(); aiCorrected=false; }
function setSync(text,type="pending"){
  const el=$("syncStatus"); el.textContent=text; el.className=`status ${type}`;
}
function showMessage(el,text,type=""){
  el.textContent=text; el.className=`message ${type}`.trim();
  clearTimeout(el._timer); if(text) el._timer=setTimeout(()=>{el.textContent="";el.className="message"},3200);
}
function showSaveToast(text,type="success"){
  const el=$("saveToast"); el.textContent=text; el.className=`save-toast ${type} show`;
  clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove("show"),1200);
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function setBusy(value){
  busy=value;
  ["loginButton","nextRoundButton","undoButton","newShoeButton","refreshButton","modeComplete","modeWinnerOnly","confirmShoeButton","addVenueButton","manageShoesButton","saveEditShoeButton","finishShoeButton","dashboardButton","refreshDashboardButton"].forEach(id=>{if($(id))$(id).disabled=value});
  document.querySelectorAll(".winner-button,.check-toggle,.rank-button").forEach(b=>b.disabled=value);
  updateRecordState();
}
function cardValue(rank){ return rank==="A"?1:["10","J","Q","K"].includes(rank)?0:Number(rank); }
function handPoints(cards){ return cards.filter(Boolean).reduce((sum,c)=>sum+cardValue(c),0)%10; }
function winnerOf(banker,player){ return banker>player?"莊":player>banker?"閒":"和"; }
function isNatural(playerTwo,bankerTwo){ return playerTwo>=8 || bankerTwo>=8; }
function playerNeedsThird(playerTwo,bankerTwo){
  if(isNatural(playerTwo,bankerTwo)) return false;
  return playerTwo<=5;
}
function bankerNeedsThird(bankerTwo,playerDrew,playerThirdRank){
  if(!playerDrew) return bankerTwo<=5;
  const p3=cardValue(playerThirdRank);
  if(bankerTwo<=2) return true;
  if(bankerTwo===3) return p3!==8;
  if(bankerTwo===4) return p3>=2 && p3<=7;
  if(bankerTwo===5) return p3>=4 && p3<=7;
  if(bankerTwo===6) return p3===6 || p3===7;
  return false;
}
function pairOf(cards){ return !!cards[0] && cards[0]===cards[1]; }
function completeProgress(){
  const [p1,p2,p3]=cardState.player;
  const [b1,b2,b3]=cardState.banker;
  if(!p1) return {complete:false,next:"player0"};
  if(!p2) return {complete:false,next:"player1"};
  if(!b1) return {complete:false,next:"banker0"};
  if(!b2) return {complete:false,next:"banker1"};
  const pTwo=handPoints([p1,p2]);
  const bTwo=handPoints([b1,b2]);
  if(isNatural(pTwo,bTwo)) return {complete:true,next:null,playerNeeds:false,bankerNeeds:false};
  const pNeeds=playerNeedsThird(pTwo,bTwo);
  if(pNeeds && !p3) return {complete:false,next:"player2",playerNeeds:true};
  const bNeeds=bankerNeedsThird(bTwo,pNeeds,p3);
  if(bNeeds && !b3) return {complete:false,next:"banker2",playerNeeds:pNeeds,bankerNeeds:true};
  return {complete:true,next:null,playerNeeds:pNeeds,bankerNeeds:bNeeds};
}
function completeDerived(){
  const progress=completeProgress();
  if(!progress.complete) return null;
  const pCards=cardState.player.filter(Boolean), bCards=cardState.banker.filter(Boolean);
  const player=handPoints(pCards), banker=handPoints(bCards);
  const pTwo=handPoints(cardState.player.slice(0,2)), bTwo=handPoints(cardState.banker.slice(0,2));
  return {
    player_points:player, banker_points:banker, winner:winnerOf(banker,player),
    player_pair:pairOf(cardState.player), banker_pair:pairOf(cardState.banker),
    player_natural:isNatural(pTwo,bTwo)&&pTwo>=8,
    banker_natural:isNatural(pTwo,bTwo)&&bTwo>=8,
    super_six:banker===6 && banker>player,
    player_card_count:pCards.length, banker_card_count:bCards.length
  };
}
function activeInputFromProgress(){
  const p=completeProgress();
  if(p.complete) return "complete";
  if(p.next==="player0"||p.next==="player1") return "playerInitial";
  if(p.next==="banker0"||p.next==="banker1") return "bankerInitial";
  return p.next;
}
function selectActiveRank(rank){
  const active=cardState.active;
  if(active==="playerInitial"){
    const index=cardState.player[0]?1:0;
    cardState.player[index]=rank;
    cardState.player[2]=null; cardState.banker[2]=null;
  }else if(active==="bankerInitial"){
    const index=cardState.banker[0]?1:0;
    cardState.banker[index]=rank;
    cardState.player[2]=null; cardState.banker[2]=null;
  }else if(active==="player2"){
    cardState.player[2]=rank; cardState.banker[2]=null;
  }else if(active==="banker2"){
    cardState.banker[2]=rank;
  }
  cardState.active=activeInputFromProgress();
  renderCardInput(); updateRecordState();
}
function editCard(side,index){
  cardState[side][index]=null;
  if(index<2){ cardState.player[2]=null; cardState.banker[2]=null; }
  if(side==="player"&&index===2) cardState.banker[2]=null;
  cardState.active=index<2?`${side}Initial`:`${side}2`;
  renderCardInput(); updateRecordState();
}
function handDisplay(side,label){
  const cards=cardState[side];
  const initialReady=!!cards[0]&&!!cards[1];
  const point=initialReady?handPoints(cards):null;
  const aiMode=inputMethod==="ai";
  const cardButton=(rank,index)=>{
    const autoRecognized=aiMode&&rank&&aiCapture.autoSlots?.[side]?.[index];
    const confirmed=aiMode&&aiCapture.confirmed?.[side]?.[index]===true;
    const needsConfirm=aiMode&&!!aiCapture.objectUrl&&aiCapture.reviewRequired&&!confirmed;
    const title=aiMode?(confirmed?"已人工確認":aiCapture.reviewRequired?"點此確認或修改":"AI 已驗證，可點擊修改"):"";
    return `<button type="button" title="${title}" class="table-card ${rank?"filled":"empty"} ${aiMode?"editable-slot":""} ${autoRecognized?"ai-recognized":""} ${needsConfirm?"ai-unconfirmed":""} ${confirmed?"ai-confirmed":""}" data-edit-side="${side}" data-edit-index="${index}" ${!aiMode&&!rank?"disabled":""}>${rank||(aiMode?"－":"·")}</button>`;
  };
  return `<div class="table-hand ${side}">
    <div class="table-hand-head"><strong>${label}</strong>${initialReady?`<span class="initial-points">＋${point}</span>`:""}</div>
    <div class="initial-cards">${cardButton(cards[0],0)}${cardButton(cards[1],1)}</div>
    <div class="third-card-row">${aiMode?cardButton(cards[2],2):(cards[2]?cardButton(cards[2],2):'<span class="third-card-placeholder"></span>')}</div>
  </div>`;
}
function activeInputLabel(active){
  return ({playerInitial:"閒",bankerInitial:"莊",player2:"閒補牌",banker2:"莊補牌"})[active]||"本局完成";
}
function aiValidation(){
  const [p1,p2,p3]=cardState.player,[b1,b2,b3]=cardState.banker;
  const confirmedCount=[...(aiCapture.confirmed?.player||[]),...(aiCapture.confirmed?.banker||[])].filter(Boolean).length;
  const allConfirmed=confirmedCount===6;
  if(!p1||!p2||!b1||!b2) return {complete:false,valid:false,message:aiCapture.objectUrl?(aiCapture.warning||`請補正並確認（${confirmedCount}/6）`):"等待拍照"};
  const pTwo=handPoints([p1,p2]),bTwo=handPoints([b1,b2]);
  const natural=isNatural(pTwo,bTwo);
  const pShould=natural?false:playerNeedsThird(pTwo,bTwo);
  const bShould=natural?false:bankerNeedsThird(bTwo,pShould,p3);
  const rulesOk=(pShould===!!p3)&&(bShould===!!b3);
  const pFinal=handPoints([p1,p2,p3]),bFinal=handPoints([b1,b2,b3]);
  const totalsOk=(aiCapture.expectedPlayerPoints===null||aiCapture.expectedPlayerPoints===pFinal)&&(aiCapture.expectedBankerPoints===null||aiCapture.expectedBankerPoints===bFinal);
  if(!rulesOk||!totalsOk) return {complete:true,valid:false,message:"牌面或補牌規則需修正"};
  // v16.5.5：只要牌面完整、補牌規則與畫面點數都一致，就直接允許儲存。
  // 後端的低信心提示不再強制六格逐一確認；使用者仍可點任一牌位修改。
  return {complete:true,valid:true,message:"AI 辨識與規則驗證通過"};
}
function chooseAiSlot(side,index){
  aiCapture.editing={side,index};
  renderCardInput();
}
function setAiSlot(rank){
  if(!aiCapture.editing)return;
  const {side,index}=aiCapture.editing;
  cardState[side][index]=rank||null;
  if(inputMethod==="ai"&&aiCapture.objectUrl) aiCorrected=true;
  if(aiCapture.autoSlots?.[side]) aiCapture.autoSlots[side][index]=false;
  if(aiCapture.confirmed?.[side]) aiCapture.confirmed[side][index]=true;
  aiCapture.editing=null;
  aiCapture.expectedPlayerPoints=null; aiCapture.expectedBankerPoints=null;
  renderCardInput();updateRecordState();
}
function renderAiEditor(){
  if(!aiCapture.editing)return "";
  const third=aiCapture.editing.index===2;
  const current=cardState[aiCapture.editing.side][aiCapture.editing.index];
  return `<section class="combined-card-input ai-rank-editor"><div class="combined-input-title">確認或修改${aiCapture.editing.side==="player"?"閒":"莊"}${aiCapture.editing.index+1}張${current?`（目前 ${current}）`:""}</div><div class="rank-grid">${RANKS.map(rank=>`<button type="button" class="rank-button ${current===rank?"current-rank":""}" data-ai-rank="${rank}">${rank}</button>`).join("")}${third?'<button type="button" class="rank-button clear-rank" data-ai-rank="">確認無第三張</button>':""}</div></section>`;
}
function renderCardInput(){
  const aiMode=inputMethod==="ai";
  const progress=completeProgress();
  if(!aiMode && cardState.active==="complete"&&!progress.complete) cardState.active=activeInputFromProgress();
  const active=cardState.active;
  const showRankGrid=!aiMode&&!progress.complete;
  const photo=aiMode&&aiCapture.objectUrl?`<div class="capture-preview-wrap"><img class="capture-preview" src="${aiCapture.objectUrl}" alt="本局拍照預覽" /></div>`:"";
  $("cardSteps").innerHTML=`
    <div class="baccarat-table-layout ${aiMode?"ai-table":""}">
      ${handDisplay("player","閒")}
      <div class="table-divider"></div>
      ${handDisplay("banker","莊")}
    </div>
    ${aiMode?`${renderAiEditor()}${photo}`:(showRankGrid?`<section class="combined-card-input"><div class="combined-input-title">${activeInputLabel(active)}</div><div class="rank-grid">${RANKS.map(rank=>`<button type="button" class="rank-button" data-active-rank="${rank}">${rank}</button>`).join("")}</div></section>`:"")}`;
  document.querySelectorAll("[data-active-rank]").forEach(b=>b.onclick=()=>selectActiveRank(b.dataset.activeRank));
  document.querySelectorAll("[data-edit-side]").forEach(b=>b.onclick=()=>aiMode?chooseAiSlot(b.dataset.editSide,Number(b.dataset.editIndex)):editCard(b.dataset.editSide,Number(b.dataset.editIndex)));
  document.querySelectorAll("[data-ai-rank]").forEach(b=>b.onclick=()=>setAiSlot(b.dataset.aiRank||null));
  const d=aiMode?(aiValidation().complete?completeDerived():null):completeDerived();
  $("completeSummary").classList.toggle("hidden",!d);
  $("completeSummary").classList.remove("result-player","result-banker","result-tie");
  if(d){
    const resultClass=d.winner==="閒"?"result-player":d.winner==="莊"?"result-banker":"result-tie";
    $("completeSummary").classList.add(resultClass);
    const tags=[]; if(d.player_pair)tags.push("閒對");if(d.banker_pair)tags.push("莊對");if(d.player_natural||d.banker_natural)tags.push("Natural（天牌）");if(d.super_six)tags.push("Lucky 6（幸運六）");
    $("completeSummary").innerHTML=`<div class="result-title">${d.winner==="和"?"和局":`${d.winner}贏`}</div><div>閒 ${d.player_points} 點｜莊 ${d.banker_points} 點</div><div class="result-tags">${tags.length?tags.join("｜"):"無額外項目"}</div>`;
  }
}
function setToggle(id,on){
  const el=$(id); el.setAttribute("aria-pressed",String(on)); el.classList.toggle("selected",on);
  el.textContent=`${on?"☑":"☐"} ${el.textContent.replace(/^[☐☑]\s*/,"")}`;
}
function updateWinnerOnlyUI(){
  document.querySelectorAll(".winner-button").forEach(b=>b.classList.toggle("selected",b.dataset.winner===winnerOnlyState.winner));
  setToggle("winnerPlayerPair",winnerOnlyState.playerPair);
  setToggle("winnerBankerPair",winnerOnlyState.bankerPair);
  const lucky=$("winnerSuperSix"); lucky.classList.toggle("hidden",winnerOnlyState.winner!=="莊");
  if(winnerOnlyState.winner!=="莊") winnerOnlyState.superSix=false;
  setToggle("winnerSuperSix",winnerOnlyState.superSix);
}
function isRecordComplete(){ return mode==="complete" ? (inputMethod==="ai"?aiValidation().complete&&aiValidation().valid:completeProgress().complete) : !!winnerOnlyState.winner; }
function updateRecordState(){
  const complete=isRecordComplete();
  const state=$("recordState");
  if(mode==="complete"&&inputMethod==="ai"){
    const v=aiValidation();
    const text=aiCapture.recognizing?"AI 辨識中":v.message;
    const cls=aiCapture.recognizing?"pending":v.valid?"valid":aiCapture.objectUrl?"warning":"incomplete";
    state.textContent=text;state.className=`record-state ${cls}`;
  }else{state.textContent=complete?"合理":"尚未輸入完整";state.className=`record-state ${complete?"valid":"incomplete"}`;}
  const can=!!currentShoe&&currentShoe.status==="open"&&!busy&&complete;
  $("nextRoundButton").disabled=!can;
}
function resetRound({resetMode=false}={}){
  cardState=freshCardState(); winnerOnlyState=freshWinnerOnlyState(); resetAiCapture();
  if(resetMode) setMode("complete"); else {renderCardInput();updateWinnerOnlyUI();updateRecordState();}
}
function nextGameNumber(){ return currentGames.length?Math.max(...currentGames.map(g=>Number(g.game_number)||0))+1:1; }
function setMode(next){
  mode=next;
  if(next!=="complete"&&inputMethod==="ai")setInputMethod("manual",{preserve:true});
  $("modeComplete").classList.toggle("active",next==="complete");
  $("modeWinnerOnly").classList.toggle("active",next==="winner_only");
  $("completePanel").classList.toggle("hidden",next!=="complete");
  $("winnerOnlyPanel").classList.toggle("hidden",next!=="winner_only");
  syncNextRoundPlacement();
  renderCardInput(); updateWinnerOnlyUI(); updateRecordState();
}

function syncNextRoundPlacement(){
  const button=$("nextRoundButton");
  const aiControls=$("aiCaptureControls");
  const home=$("nextRoundHome");
  const shouldPlaceUnderCamera=mode==="complete"&&inputMethod==="ai";
  const target=shouldPlaceUnderCamera?aiControls:home;
  if(button.parentElement!==target)target.appendChild(button);
  button.classList.toggle("ai-next-round",shouldPlaceUnderCamera);
}

function setInputMethod(next,{preserve=false}={}){
  if(next==="ai"&&!aiAllowed())return;
  if(next!=="ai")closeAiCamera();
  if(!preserve){cardState=freshCardState();resetAiCapture();}
  inputMethod=next;
  $("manualInputMethod").classList.toggle("active",next==="manual");
  $("aiInputMethod").classList.toggle("active",next==="ai");
  $("aiCaptureControls").classList.toggle("hidden",next!=="ai");
  syncNextRoundPlacement();
  renderCardInput();updateRecordState();
}
function renderExtra(g){
  const items=[];
  if(g.record_status==="winner_only")items.push("只記勝方");
  if(g.player_pair)items.push("閒對"); if(g.banker_pair)items.push("莊對");
  if(g.player_card_count)items.push(`閒 ${g.player_card_count} 張`); if(g.banker_card_count)items.push(`莊 ${g.banker_card_count} 張`);
  if(g.player_natural)items.push("閒自然牌"); if(g.banker_natural)items.push("莊自然牌"); if(g.super_six)items.push("Lucky 6");
  return items.length?`<div class="game-extra">${items.join("｜")}</div>`:"";
}
function render(){
  const next=nextGameNumber();
  $("shoeNumber").textContent=currentShoe?.shoe_number||"尚未建立";
  $("currentVenue").textContent=currentShoe?.venue||"尚未選擇";
  $("nextGameNumber").textContent=`第 ${next} 局`;
  if(document.activeElement!==$("gameNumberInput")) $("gameNumberInput").value=next;
  $("shoeState").textContent=currentShoe?(currentShoe.status==="open"?"進行中｜已鎖定":"已結束"):"未開始";
  $("shoeOwner").textContent=currentShoe?(currentProfile?.display_name||currentProfile?.username||"目前帳號"):"—";
  const can=!!currentShoe&&currentShoe.status==="open"&&!busy;
  $("undoButton").disabled=!can||!currentGames.length;
  document.querySelectorAll(".winner-button").forEach(b=>b.disabled=!can);
  const rows=[...currentGames].sort((a,b)=>a.game_number-b.game_number).slice(-10).reverse();
  $("recentGames").innerHTML=rows.length?rows.map(g=>`<div class="game-row"><div class="game-main"><strong>第 ${g.game_number} 局</strong><span>${g.record_status==="winner_only"?"點數未記錄":`閒 ${g.player_points} 點｜莊 ${g.banker_points} 點`}</span><span class="winner ${g.winner==="莊"?"banker":g.winner==="閒"?"player":"tie"}">${g.winner}</span></div>${renderExtra(g)}</div>`).join(""):'<p class="empty">尚無牌局資料</p>';
  updateRecordState();
}
function localVenues(){try{return JSON.parse(localStorage.getItem(LOCAL_VENUES_KEY)||"[]").filter(Boolean)}catch{return[]}}
function saveLocalVenues(list){localStorage.setItem(LOCAL_VENUES_KEY,JSON.stringify([...new Set(list)]))}
async function loadVenues(){
  const {data,error}=await supabase.from("shoes").select("venue").not("venue","is",null); if(error)throw error;
  const cloud=(data||[]).map(r=>(r.venue||"").trim()).filter(Boolean);
  venueOptions=[...new Set([...localVenues(),...cloud])].sort((a,b)=>a.localeCompare(b,"zh-Hant")); renderVenueOptions();
}
function renderVenueOptions(selected=""){
  const select=$("venueSelect"),preferred=selected||localStorage.getItem(DEFAULT_VENUE_KEY)||venueOptions[0]||"";
  select.innerHTML='<option value="">請選擇場館</option>'+venueOptions.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if(venueOptions.includes(preferred))select.value=preferred;
}
function openShoeModal(){if(busy)return;renderVenueOptions();$("shoeNameInput").value="";$("startGameInput").value="1";$("defaultVenueCheckbox").checked=false;$("shoeModalMessage").textContent="";$("newShoeModal").classList.remove("hidden")}
function closeShoeModal(){if(!busy)$("newShoeModal").classList.add("hidden")}
function addVenue(){const raw=prompt("請輸入場館名稱");if(raw===null)return;const venue=raw.trim();if(!venue)return showMessage($("shoeModalMessage"),"場館名稱不能空白","error");if(!venueOptions.includes(venue))venueOptions.push(venue);venueOptions.sort((a,b)=>a.localeCompare(b,"zh-Hant"));saveLocalVenues(venueOptions);renderVenueOptions(venue)}
async function loadCloudData(){
  setSync("同步中");
  const {data:shoes,error:se}=await supabase.from("shoes").select("*").eq("status","open").eq("is_archived",false).eq("owner_id",currentUser.id).order("created_at",{ascending:false}).limit(1); if(se)throw se;
  currentShoe=shoes?.[0]||null;
  if(!currentShoe){currentGames=[];setSync("已連線","ok");render();return}
  const {data:games,error:ge}=await supabase.from("games").select("*").eq("shoe_id",currentShoe.id).order("game_number",{ascending:true}); if(ge)throw ge;
  currentGames=games||[];setSync("已同步","ok");render();
}
async function createNewShoe(){
  if(busy)return;const venue=$("venueSelect").value.trim(),name=$("shoeNameInput").value.trim(),start=Number($("startGameInput").value);
  if(!venue)return showMessage($("shoeModalMessage"),"請先選擇或新增場館","error");
  if(!Number.isInteger(start)||start<1)return showMessage($("shoeModalMessage"),"開始局數必須是 1 以上的整數","error");
  if(currentShoe?.status==="open"&&currentGames.length&&!confirm("建立新牌靴後，只會結束你自己目前的牌靴。確定繼續嗎？"))return;
  setBusy(true);
  try{
    setSync("同步中");
    const {data,error}=await supabase.rpc("create_my_shoe",{p_venue:venue,p_name:name||null});
    if(error)throw error;
    currentShoe=data;currentGames=[];
    if($("defaultVenueCheckbox").checked)localStorage.setItem(DEFAULT_VENUE_KEY,venue);
    if(!venueOptions.includes(venue))venueOptions.push(venue);saveLocalVenues(venueOptions);
    resetRound({resetMode:true});$("gameNumberInput").value=start;setSync("已同步","ok");showMessage(appMessage,`已開始 ${data.shoe_number}｜${venue}｜由 ${currentProfile.display_name} 負責`,"success");$("newShoeModal").classList.add("hidden");
  }catch(e){console.error(e);setSync("同步失敗","error");showMessage($("shoeModalMessage"),e.message||"建立牌靴失敗","error")}
  finally{setBusy(false);render();$("gameNumberInput").value=start}
}
async function finishCurrentShoe(){
  if(busy||!currentShoe||currentShoe.status!=="open")return;
  if(!confirm(`確定完成 ${currentShoe.shoe_number}？完成後會鎖定，不能再新增牌局。`))return;
  setBusy(true);
  try{const {data,error}=await supabase.rpc("finish_my_shoe",{p_shoe_id:currentShoe.id});if(error)throw error;currentShoe=data;currentGames=[];closeAiCamera();cardState=freshCardState();winnerOnlyState=freshWinnerOnlyState();resetAiCapture();$("gameNumberInput").value=1;setSync("已同步","ok");showSaveToast("✓ 牌靴已完成並鎖定");renderCardInput();updateWinnerOnlyUI();updateRecordState();render()}
  catch(e){showMessage(appMessage,e.message||"完成牌靴失敗","error")}
  finally{setBusy(false)}
}
async function saveAndNext(){
  if(busy||!currentShoe||currentShoe.status!=="open")return;
  if(!isRecordComplete())return showMessage(appMessage,"本局尚未輸入完整","error");
  const gameNumber=Number($("gameNumberInput").value);
  if(!Number.isInteger(gameNumber)||gameNumber<1)return showMessage(appMessage,"局數必須是 1 以上的整數","error");
  if(currentGames.some(g=>Number(g.game_number)===gameNumber))return showMessage(appMessage,`第 ${gameNumber} 局已存在，請改用其他局數`,"error");
  let game;
  if(mode==="complete"){
    const d=completeDerived();
    game={shoe_id:currentShoe.id,recorded_by:currentUser.id,game_number:gameNumber,record_status:"complete",input_method:inputMethod,ai_corrected:inputMethod==="ai"&&aiCorrected,...d,difference:d.banker_points-d.player_points,
      player_card_1:cardState.player[0],player_card_2:cardState.player[1],player_card_3:cardState.player[2],
      banker_card_1:cardState.banker[0],banker_card_2:cardState.banker[1],banker_card_3:cardState.banker[2]};
  }else{
    game={shoe_id:currentShoe.id,recorded_by:currentUser.id,game_number:gameNumber,record_status:"winner_only",input_method:"winner_only",ai_corrected:false,winner:winnerOnlyState.winner,
      banker_points:null,player_points:null,difference:null,banker_pair:winnerOnlyState.bankerPair,player_pair:winnerOnlyState.playerPair,
      banker_card_count:null,player_card_count:null,banker_natural:false,player_natural:false,super_six:winnerOnlyState.winner==="莊"&&winnerOnlyState.superSix,
      player_card_1:null,player_card_2:null,player_card_3:null,banker_card_1:null,banker_card_2:null,banker_card_3:null};
  }
  setBusy(true);
  try{
    setSync("同步中");const {data,error}=await supabase.from("games").insert(game).select().single();if(error)throw error;
    currentGames.push(data);setSync("已同步","ok");
    const savedSummary=mode==="complete"?`✓ 第 ${gameNumber} 局已成功儲存｜閒 ${game.player_points} 點・莊 ${game.banker_points} 點・${game.winner}贏`:`✓ 第 ${gameNumber} 局已成功儲存｜${game.winner}`;
    lastSavedCameraResult=savedSummary;showSaveToast(`✓ 第 ${gameNumber} 局已儲存`);
    resetRound();$("gameNumberInput").value=gameNumber+1;render();
    if(inputMethod==="ai"&&mode==="complete") setTimeout(()=>openAiCamera(),180);
  }catch(e){console.error(e);setSync("同步失敗","error");showSaveToast("儲存失敗","error");showMessage(appMessage,e.message||"儲存失敗","error")}
  finally{setBusy(false);render()}
}
function formatDate(value){if(!value)return"—";return new Intl.DateTimeFormat("zh-TW",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}
function closeManagerModal(){if(!busy)$("shoeManagerModal").classList.add("hidden")}
function closeDetailModal(){$("shoeDetailModal").classList.add("hidden")}
function closeEditModal(){if(!busy){$("editShoeModal").classList.add("hidden");editingShoe=null}}
async function openShoeManager(){if(busy)return;$("shoeManagerModal").classList.remove("hidden");$("managerMessage").textContent="";$("shoeManagerList").innerHTML='<p class="empty">讀取中…</p>';try{const {data,error}=await supabase.from("shoes").select("*").order("created_at",{ascending:false});if(error)throw error;const {data:people}=await supabase.from("profiles").select("id,display_name,username");const ownerMap=new Map((people||[]).map(p=>[p.id,p.display_name||p.username]));const counts=await Promise.all((data||[]).map(async s=>{const {count}=await supabase.from("games").select("id",{count:"exact",head:true}).eq("shoe_id",s.id);return {...s,owner_name:ownerMap.get(s.owner_id)||"未分配",game_count:count||0}}));allShoes=counts;renderShoeManager()}catch(e){showMessage($("managerMessage"),e.message||"讀取牌靴失敗","error")}}
function filteredShoes(){const q=$("shoeSearchInput").value.trim().toLowerCase(),status=$("shoeStatusFilter").value;return allShoes.filter(s=>{const archived=!!s.is_archived;if(status==="active"&&archived)return false;if(status==="archived"&&!archived)return false;const text=[s.shoe_number,s.name,s.venue].filter(Boolean).join(" ").toLowerCase();return !q||text.includes(q)})}
function renderShoeManager(){
  const list=filteredShoes();
  $("shoeManagerList").innerHTML=list.length?list.map(s=>{const active=currentShoe?.id===s.id,archived=!!s.is_archived;return `<div class="shoe-manager-row ${archived?"archived-row":""}"><div class="shoe-manager-main"><strong>${escapeHtml(s.shoe_number||"未命名")}${active?'<span class="active-shoe-marker">目前</span>':""}</strong><small>${escapeHtml(s.name||"未填名稱")}</small></div><div><strong>${escapeHtml(s.venue||"未選場館")}</strong><div class="shoe-manager-meta">負責：${escapeHtml(s.owner_name||"未分配")}｜${archived?"已封存":s.status==="open"?"進行中":"已結束"}</div></div><div class="shoe-manager-meta">${Number(s.game_count)||"—"}</div><div class="shoe-manager-meta">${formatDate(s.created_at)}</div><div class="shoe-actions"><button class="secondary" data-action="view" data-id="${s.id}">查看</button><button class="warning" data-action="edit" data-id="${s.id}">修改</button><button class="${archived?"restore":"archive"}" data-action="archive" data-id="${s.id}">${archived?"復原":"封存"}</button><button class="danger" data-action="delete" data-id="${s.id}">刪除</button></div></div>`}).join(""):'<p class="empty">沒有符合條件的牌靴</p>';
  document.querySelectorAll("#shoeManagerList [data-action]").forEach(b=>b.onclick=()=>handleShoeAction(b.dataset.action,b.dataset.id));
}
async function handleShoeAction(action,id){const shoe=allShoes.find(s=>String(s.id)===String(id));if(!shoe)return;if(action==="view")return viewShoe(shoe);if(action==="edit")return openEditShoe(shoe);if(action==="archive")return toggleArchiveShoe(shoe);if(action==="delete")return deleteShoe(shoe)}
function detailCards(g,side){
  const cards=[g[`${side}_card_1`],g[`${side}_card_2`],g[`${side}_card_3`]].filter(Boolean);
  return cards.length?cards.map(escapeHtml).join("、"):"未記錄牌面";
}
function gameMethodLabel(g){
  if(g.record_status==="winner_only"||g.input_method==="winner_only")return"僅記勝方";
  if(g.input_method==="ai")return"AI 拍照辨識";
  return"手動完整記錄";
}
function gameSpecials(g){
  const x=[];
  if(g.player_pair)x.push("閒對");if(g.banker_pair)x.push("莊對");
  if(g.player_natural||g.banker_natural)x.push("Natural");if(g.super_six)x.push("Lucky 6");
  return x.length?x.join("、"):"無";
}
function gameDetailCard(g,shoeLabel=""){
  const winnerClass=g.winner==="莊"?"banker":g.winner==="閒"?"player":"tie";
  const complete=g.record_status!=="winner_only";
  const pCards=[g.player_card_1,g.player_card_2,g.player_card_3].filter(Boolean);
  const bCards=[g.banker_card_1,g.banker_card_2,g.banker_card_3].filter(Boolean);
  return `<article class="management-game-card"><div class="detail-game-head"><strong>${shoeLabel?`${escapeHtml(shoeLabel)}｜`:""}第 ${g.game_number} 局</strong><span class="winner ${winnerClass}">${escapeHtml(g.winner||"—")}</span></div><div class="management-game-time">${formatDate(g.created_at)}｜${escapeHtml(gameMethodLabel(g))}</div>${complete?`<div class="management-hand-grid"><div><small>閒｜${pCards.length} 張｜${g.player_points} 點</small><b>${pCards.map(escapeHtml).join("、")||"—"}</b></div><div><small>莊｜${bCards.length} 張｜${g.banker_points} 點</small><b>${bCards.map(escapeHtml).join("、")||"—"}</b></div></div>`:`<div class="winner-only-note">僅記錄勝方，牌面與點數未記錄</div>`}<div class="management-game-tags"><span>狀態：${complete?"完整記錄":"僅記勝方"}</span><span>特殊牌型：${escapeHtml(gameSpecials(g))}</span><span>人工修正：${g.ai_corrected===true?"是":"否"}</span></div></article>`;
}
async function viewShoe(shoe,options={}){
  const recorderHistory=options.recorderHistory===true;
  $("shoeDetailTitle").textContent=`${shoe.shoe_number||"未命名"} 牌靴資訊`;
  $("shoeDetailMeta").textContent=`${shoe.venue||"未選場館"}${recorderHistory?"｜唯讀檢視":""}`;
  $("shoeDetailSummary").innerHTML='<p class="empty">讀取中…</p>';
  $("shoeDetailGames").innerHTML='<p class="empty">讀取中…</p>';
  $("shoeDetailGames").classList.add("hidden");$("showShoeGamesButton").classList.add("hidden");
  $("shoeDetailModal").classList.remove("hidden");
  try{
    const [{data:games,error},{data:profile,error:profileError}]=await Promise.all([
      supabase.from("games").select("*").eq("shoe_id",shoe.id).order("game_number",{ascending:true}),
      shoe.owner_id?supabase.from("profiles").select("display_name,username").eq("id",shoe.owner_id).maybeSingle():Promise.resolve({data:null,error:null})
    ]);
    if(error)throw error;if(profileError)throw profileError;
    const rows=games||[];const owner=profile?.display_name||profile?.username||shoe.owner_name||"未指定";
    const winnerOnly=rows.filter(g=>g.record_status==="winner_only").length;
    const started=shoe.recording_started_at||shoe.created_at;const ended=shoe.finished_at;
    $("shoeDetailSummary").innerHTML=`<div class="shoe-summary-grid"><div><small>牌靴編號</small><b>${escapeHtml(shoe.shoe_number||"未命名")}</b></div><div><small>狀態</small><b>${shoe.status==="open"?"進行中":"已完成"}</b></div><div><small>記錄人員</small><b>${escapeHtml(owner)}</b></div><div><small>開始時間</small><b>${formatDate(started)}</b></div><div><small>結束時間</small><b>${ended?formatDate(ended):"尚未完成"}</b></div><div><small>總時長</small><b>${ended?formatDuration(started,ended):"進行中"}</b></div><div><small>總局數</small><b>${rows.length} 局</b></div><div><small>僅記勝方</small><b>${winnerOnly} 局</b></div></div>`;
    $("shoeDetailGames").innerHTML=rows.length?rows.map(g=>gameDetailCard(g)).join(""):'<p class="empty">這個牌靴尚無牌局</p>';
    $("showShoeGamesButton").classList.remove("hidden");
    $("showShoeGamesButton").textContent=`查看各局記錄（${rows.length} 局）`;
    $("showShoeGamesButton").onclick=()=>{$("shoeDetailGames").classList.remove("hidden");$("showShoeGamesButton").classList.add("hidden");};
  }catch(e){$("shoeDetailSummary").innerHTML=`<p class="empty">${escapeHtml(e.message||"讀取失敗")}</p>`;}
}

function openEditShoe(shoe){editingShoe=shoe;const select=$("editVenueSelect"),options=[...new Set([...venueOptions,shoe.venue].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));select.innerHTML='<option value="">請選擇場館</option>'+options.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");select.value=shoe.venue||"";$("editShoeNameInput").value=shoe.name||"";$("editShoeMessage").textContent="";$("editShoeModal").classList.remove("hidden")}
async function saveEditedShoe(){if(busy||!editingShoe)return;const venue=$("editVenueSelect").value.trim(),name=$("editShoeNameInput").value.trim();if(!venue)return showMessage($("editShoeMessage"),"請選擇場館","error");setBusy(true);try{const {data,error}=await supabase.from("shoes").update({venue,name}).eq("id",editingShoe.id).select().single();if(error)throw error;allShoes=allShoes.map(s=>s.id===data.id?{...data,game_count:s.game_count||0}:s);if(currentShoe?.id===data.id)currentShoe=data;if(!venueOptions.includes(venue)){venueOptions.push(venue);saveLocalVenues(venueOptions)}render();renderShoeManager();showSaveToast("✓ 牌靴資料已更新");closeEditModal()}catch(e){showMessage($("editShoeMessage"),e.message||"修改失敗","error")}finally{setBusy(false)}}
async function toggleArchiveShoe(shoe){const willArchive=!shoe.is_archived;if(willArchive&&currentShoe?.id===shoe.id&&!confirm(`這是目前進行中的 ${shoe.shoe_number}。封存後將無法繼續記錄，確定封存嗎？`))return;if(!willArchive&&!confirm(`確定復原 ${shoe.shoe_number} 嗎？`))return;setBusy(true);try{const updates={is_archived:willArchive,archived_at:willArchive?new Date().toISOString():null};if(willArchive&&shoe.status==="open"){updates.status="finished";updates.finished_at=new Date().toISOString()}const {data,error}=await supabase.from("shoes").update(updates).eq("id",shoe.id).select().single();if(error)throw error;allShoes=allShoes.map(s=>s.id===data.id?{...data,game_count:s.game_count||0}:s);if(currentShoe?.id===shoe.id&&willArchive){currentShoe=null;currentGames=[]}render();renderShoeManager();showSaveToast(willArchive?"✓ 牌靴已封存":"✓ 牌靴已復原")}catch(e){showMessage($("managerMessage"),e.message||"操作失敗","error")}finally{setBusy(false)}}
async function deleteShoe(shoe){const {count,error:ce}=await supabase.from("games").select("id",{count:"exact",head:true}).eq("shoe_id",shoe.id);if(ce)return showMessage($("managerMessage"),ce.message||"無法確認牌局數","error");if(!confirm(`確定永久刪除 ${shoe.shoe_number}？\n場館：${shoe.venue||"未選場館"}\n共 ${count||0} 局\n\n此操作無法復原。`))return;setBusy(true);try{let r=await supabase.from("games").delete().eq("shoe_id",shoe.id);if(r.error)throw r.error;r=await supabase.from("shoes").delete().eq("id",shoe.id);if(r.error)throw r.error;allShoes=allShoes.filter(s=>s.id!==shoe.id);if(currentShoe?.id===shoe.id){currentShoe=null;currentGames=[]}render();renderShoeManager();showSaveToast("✓ 牌靴已永久刪除")}catch(e){showMessage($("managerMessage"),e.message||"刪除失敗","error")}finally{setBusy(false)}}
async function deleteLastGame(){if(busy||!currentGames.length)return;const last=[...currentGames].sort((a,b)=>a.game_number-b.game_number).at(-1);if(!confirm(`確定刪除第 ${last.game_number} 局嗎？`))return;setBusy(true);try{setSync("同步中");const {error}=await supabase.from("games").delete().eq("id",last.id);if(error)throw error;currentGames=currentGames.filter(g=>g.id!==last.id);setSync("已同步","ok");showMessage(appMessage,"上一局已刪除","success")}catch(e){setSync("同步失敗","error");showMessage(appMessage,e.message||"刪除失敗","error")}finally{setBusy(false);render()}}


function startOfTodayIso(){const d=new Date();d.setHours(0,0,0,0);return d.toISOString()}
function isOnlineUser(id){return onlineProfiles.has(String(id))}
function flattenPresence(state){
  const map=new Map();
  Object.values(state||{}).flat().forEach(p=>{if(p?.user_id)map.set(String(p.user_id),p)});
  onlineProfiles=map;
  if(isModalOpen("dashboardModal"))renderDashboard();
  if(isModalOpen("userManagerModal"))renderManagedUsers();
}
function closeManagementList(){if(!busy)$("managementListModal").classList.add("hidden")}
function managementShoeCard(s){
  return `<button class="admin-record-card management-shoe-card" data-management-shoe-id="${s.id}" type="button"><div class="admin-record-title"><strong>${escapeHtml(s.shoe_number||"未命名牌靴")}</strong><span>${s.count||0} 局</span></div><div class="admin-record-grid"><div><small>狀態</small><b>${s.status==="open"?"進行中":"已完成"}</b></div><div><small>場館</small><b>${escapeHtml(s.venue||"未選場館")}</b></div><div><small>記錄人員</small><b>${escapeHtml(s.owner_name||"未指定")}</b></div><div><small>${s.status==="open"?"開始時間":"完成時間"}</small><b>${formatDate(s.status==="open"?s.recording_started_at||s.created_at:s.finished_at)}</b></div></div></button>`;
}
function renderManagementList(){
  const q=$("managementListSearch").value.trim().toLowerCase();
  if(managementListType==="games"){
    const list=managementListData.filter(x=>!q||[x.shoe_number,x.winner,x.record_status,gameMethodLabel(x)].join(" ").toLowerCase().includes(q));
    $("managementListBody").innerHTML=list.length?list.map(g=>gameDetailCard(g,g.shoe_number||"牌靴")).join(""):'<p class="empty">沒有符合條件的牌局</p>';
    $("managementListCount").textContent=`${list.length} 局`;
  }else{
    const list=managementListData.filter(s=>!q||[s.shoe_number,s.name,s.venue,s.owner_name].filter(Boolean).join(" ").toLowerCase().includes(q));
    $("managementListBody").innerHTML=list.length?list.map(managementShoeCard).join(""):'<p class="empty">沒有符合條件的牌靴</p>';
    $("managementListCount").textContent=`${list.length} 副`;
    $("managementListBody").querySelectorAll("[data-management-shoe-id]").forEach(b=>b.onclick=async()=>{const s=managementListData.find(x=>String(x.id)===String(b.dataset.managementShoeId));if(s)await viewShoe(s);});
  }
}
async function enrichShoes(shoes){
  const owners=[...new Set(shoes.map(s=>s.owner_id).filter(Boolean))];let map=new Map();
  if(owners.length){const r=await supabase.from("profiles").select("id,display_name,username").in("id",owners);if(r.error)throw r.error;map=new Map((r.data||[]).map(p=>[String(p.id),p.display_name||p.username||"未命名人員"]));}
  const out=[];for(const s of shoes){const c=await supabase.from("games").select("id",{count:"exact",head:true}).eq("shoe_id",s.id);if(c.error)throw c.error;out.push({...s,count:c.count||0,owner_name:map.get(String(s.owner_id))||"未指定"});}return out;
}
async function openManagementList(type){
  managementListType=type;managementListData=[];managementGamesOffset=0;
  $("managementListModal").classList.remove("hidden");$("managementListBody").innerHTML='<p class="empty">讀取中…</p>';$("managementListSearch").value="";$("managementLoadMoreButton").classList.add("hidden");
  const title={active:"進行中牌靴",today:"今日完成牌靴",finished:"總完成牌靴",games:"總累計局數"}[type]||"管理列表";
  $("managementListTitle").textContent=title;$("managementListMeta").textContent="點擊牌靴可先查看管理資訊，再查看各局記錄。";
  try{
    if(type==="games"){
      const r=await supabase.from("games").select("*").order("created_at",{ascending:false}).range(0,199);if(r.error)throw r.error;
      const shoes=[...new Set((r.data||[]).map(g=>g.shoe_id).filter(Boolean))];let sm=new Map();if(shoes.length){const sr=await supabase.from("shoes").select("id,shoe_number").in("id",shoes);if(sr.error)throw sr.error;sm=new Map((sr.data||[]).map(s=>[String(s.id),s.shoe_number]));}
      managementListData=(r.data||[]).map(g=>({...g,shoe_number:sm.get(String(g.shoe_id))||"未知牌靴"}));$("managementListMeta").textContent="依記錄時間由新到舊，顯示最近 200 局。";
    }else{
      let q=supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").eq("is_archived",false);
      if(type==="active")q=q.eq("status","open").order("created_at",{ascending:false});
      if(type==="today")q=q.gte("finished_at",startOfTodayIso()).order("finished_at",{ascending:false});
      if(type==="finished")q=q.not("finished_at","is",null).order("finished_at",{ascending:false});
      const r=await q;if(r.error)throw r.error;managementListData=await enrichShoes(r.data||[]);
    }
    renderManagementList();
  }catch(e){showMessage($("managementListMessage"),e.message||"讀取失敗","error");$("managementListBody").innerHTML='<p class="empty">讀取失敗</p>';}
}
function closeDashboard(){if(!busy)$("dashboardModal").classList.add("hidden")}
async function openDashboard(){
  if(currentProfile?.role!=="admin")return;
  $("dashboardModal").classList.remove("hidden");
  $("dashboardMessage").textContent="";
  await loadDashboard();
}
function scheduleDashboardReload(){
  if(currentProfile?.role!=="admin"||!isModalOpen("dashboardModal"))return;
  clearTimeout(dashboardRefreshTimer);
  dashboardRefreshTimer=setTimeout(()=>loadDashboard(true),350);
}
async function loadDashboard(silent=false){
  if(currentProfile?.role!=="admin")return;
  if(!silent){
    $("dashboardActiveShoes").innerHTML='<p class="empty">讀取中…</p>';
    $("dashboardFinishedShoes").innerHTML='<p class="empty">讀取中…</p>';
    $("dashboardPersonnelList").innerHTML='<p class="empty">讀取中…</p>';
  }
  try{
    const today=startOfTodayIso();
    const [activeR,todayFinishedR,totalShoesR,totalGamesR,recentShoesR,finishedR]=await Promise.all([
      supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").eq("status","open").eq("is_archived",false).order("created_at",{ascending:false}),
      supabase.from("shoes").select("id",{count:"exact",head:true}).gte("finished_at",today).eq("is_archived",false),
      supabase.from("shoes").select("id",{count:"exact",head:true}).not("finished_at","is",null).eq("is_archived",false),
      supabase.from("games").select("id",{count:"exact",head:true}),
      supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").order("created_at",{ascending:false}).limit(30),
      supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").not("finished_at","is",null).eq("is_archived",false).order("finished_at",{ascending:false}).limit(5)
    ]);
    const responses=[activeR,todayFinishedR,totalShoesR,totalGamesR,recentShoesR,finishedR];
    const err=responses.find(r=>r.error)?.error;if(err)throw err;
    const active=activeR.data||[],finished=finishedR.data||[];
    const ownerIds=[...new Set([...active,...finished].map(s=>s.owner_id).filter(Boolean))];
    let ownerMap=new Map();
    if(ownerIds.length){const pr=await supabase.from("profiles").select("id,display_name,username").in("id",ownerIds);if(pr.error)throw pr.error;ownerMap=new Map((pr.data||[]).map(p=>[String(p.id),p.display_name||p.username||"未命名人員"]));}
    const shoeIds=[...new Set([...active,...finished].map(s=>s.id))];
    let games=[];
    if(shoeIds.length){const gr=await supabase.from("games").select("shoe_id,game_number,created_at").in("shoe_id",shoeIds);if(gr.error)throw gr.error;games=gr.data||[]}
    const gameMap=new Map();
    games.forEach(g=>{const key=String(g.shoe_id),x=gameMap.get(key)||{count:0,last_at:null};x.count+=1;if(!x.last_at||new Date(g.created_at)>new Date(x.last_at))x.last_at=g.created_at;gameMap.set(key,x)});
    const attach=s=>({...s,owner_name:ownerMap.get(String(s.owner_id))||"未指定",...(gameMap.get(String(s.id))||{count:0,last_at:null})});
    dashboardData={active:active.map(attach),finished:finished.map(attach),todayFinished:todayFinishedR.count||0,totalShoes:totalShoesR.count||0,totalGames:totalGamesR.count||0,recentShoes:recentShoesR.data||[]};
    renderDashboard();
    await loadPersonnelStatsInline();
  }catch(e){console.error(e);showMessage($("dashboardMessage"),e.message||"讀取管理總覽失敗","error")}
}
function formatDuration(start,end){
  if(!start||!end)return"—";
  const minutes=Math.max(0,Math.round((new Date(end)-new Date(start))/60000));
  if(minutes<60)return`${minutes} 分鐘`;
  const h=Math.floor(minutes/60),m=minutes%60;
  return m?`${h} 小時 ${m} 分`:`${h} 小時`;
}
function dashboardShoeRow(s,finished=false){
  return `<button class="dashboard-row shoe dashboard-open-shoe" data-shoe-id="${s.id}" type="button"><div class="dashboard-row-main"><strong>${escapeHtml(s.shoe_number||"未命名")}</strong><small>${escapeHtml(s.venue||"未選場館")}${s.name&&s.name!==s.shoe_number?`｜${escapeHtml(s.name)}`:""}｜記錄者：${escapeHtml(s.owner_name||"未指定")}</small></div><div class="dashboard-shoe-count"><strong>${s.count||0}</strong><small>局</small></div><span class="dashboard-time">${finished?`${formatDate(s.finished_at)}｜記錄時長：${s.recording_started_at?formatDuration(s.recording_started_at,s.finished_at):"尚未開始記錄"}`:(s.last_at?`最後記錄 ${formatDate(s.last_at)}`:`開始 ${formatDate(s.created_at)}`)}</span></button>`;
}
function bindDashboardShoeRows(){
  document.querySelectorAll(".dashboard-open-shoe").forEach(b=>b.onclick=async()=>{
    const id=String(b.dataset.shoeId);
    const shoe=[...(dashboardData?.active||[]),...(dashboardData?.finished||[]),...(dashboardData?.recentShoes||[])].find(s=>String(s.id)===id);
    if(shoe)await viewShoe(shoe);
  });
}
function renderDashboard(){
  if(!dashboardData)return;
  const d=dashboardData;
  $("statActiveShoes").textContent=d.active.length;$("statTodayFinished").textContent=d.todayFinished;$("statTotalShoes").textContent=d.totalShoes;$("statTotalGames").textContent=d.totalGames;
  $("dashboardUpdatedAt").textContent=`更新 ${new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date())}`;
  $("dashboardShoeSummary").textContent=`${d.active.length} 副進行中`;
  $("dashboardActiveShoes").innerHTML=d.active.length?d.active.map(s=>dashboardShoeRow(s,false)).join(""):'<p class="empty">目前沒有進行中的牌靴</p>';
  $("dashboardFinishedShoes").innerHTML=d.finished.length?d.finished.map(s=>dashboardShoeRow(s,true)).join(""):'<p class="empty">目前沒有已完成牌靴</p>';
  bindDashboardShoeRows();
}

function formatDateOnly(value){if(!value)return"—";return new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));}
function closeMyRecentShoes(){if(!busy)$("myRecentShoesModal").classList.add("hidden")}
function myRecentShoeCard(s){
  const displayName=s.name&&s.name!==s.shoe_number?s.name:"未填名稱";
  return `<button class="admin-record-card recorder-history-card" data-my-shoe-id="${s.id}" type="button"><div class="admin-record-title"><strong>${escapeHtml(s.shoe_number||"未命名牌靴")}</strong><span>${s.count||0} 局</span></div><div class="admin-record-grid recorder-history-grid"><div><small>牌靴名稱</small><b>${escapeHtml(displayName)}</b></div><div><small>完成日期</small><b>${formatDateOnly(s.finished_at)}</b></div><div><small>場館名稱</small><b>${escapeHtml(s.venue||"未選場館")}</b></div><div><small>總局數</small><b>${s.count||0} 局</b></div></div></button>`;
}
async function openMyRecentShoes(){
  if(!currentUser)return;
  $("myRecentShoesModal").classList.remove("hidden");$("myRecentShoesMessage").textContent="";$("myRecentShoesList").innerHTML='<p class="empty">讀取中…</p>';
  try{
    const r=await supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").eq("owner_id",currentUser.id).not("finished_at","is",null).eq("is_archived",false).order("finished_at",{ascending:false}).limit(20);
    if(r.error)throw r.error;
    const counts=await Promise.all((r.data||[]).map(async shoe=>{const c=await supabase.from("games").select("id",{count:"exact",head:true}).eq("shoe_id",shoe.id);if(c.error)throw c.error;return {...shoe,count:c.count||0};}));
    myRecentShoesData=counts;
    $("myRecentShoesList").innerHTML=counts.length?counts.map(myRecentShoeCard).join(""):'<p class="empty">目前沒有已完成牌靴</p>';
    $("myRecentShoesList").querySelectorAll("[data-my-shoe-id]").forEach(b=>b.onclick=async()=>{const shoe=myRecentShoesData.find(x=>String(x.id)===String(b.dataset.myShoeId));if(shoe)await viewShoe(shoe,{recorderHistory:true});});
  }catch(e){showMessage($("myRecentShoesMessage"),e.message||"讀取最近牌靴失敗","error");$("myRecentShoesList").innerHTML='<p class="empty">讀取失敗</p>';}
}
function closeFinishedHistory(){if(!busy)$("finishedHistoryModal").classList.add("hidden")}
function closePersonnelStats(){if(!busy)$("personnelStatsModal").classList.add("hidden")}
function closePersonnelDetail(){if(!busy)$("personnelDetailModal").classList.add("hidden")}
function adminRecordCard(s){
  const displayName=s.name&&s.name!==s.shoe_number?s.name:"未填名稱";
  return `<button class="admin-record-card" data-admin-shoe-id="${s.id}" type="button"><div class="admin-record-title"><strong>${escapeHtml(s.shoe_number||"未命名牌靴")}</strong><span>${s.count||0} 局</span></div><div class="admin-record-grid"><div><small>牌靴名稱</small><b>${escapeHtml(displayName)}</b></div><div><small>場館名稱</small><b>${escapeHtml(s.venue||"未選場館")}</b></div><div><small>記錄者</small><b>${escapeHtml(s.owner_name||"未指定")}</b></div><div><small>開始記錄</small><b>${s.recording_started_at?formatDate(s.recording_started_at):"尚未開始"}</b></div><div><small>完成時間</small><b>${formatDate(s.finished_at)}</b></div><div><small>記錄時長</small><b>${s.recording_started_at?formatDuration(s.recording_started_at,s.finished_at):"—"}</b></div></div></button>`;
}
async function attachAdminShoeDetails(shoes){
  const ownerIds=[...new Set(shoes.map(s=>s.owner_id).filter(Boolean))];
  let ownerMap=new Map();
  if(ownerIds.length){const r=await supabase.from("profiles").select("id,display_name,username").in("id",ownerIds);if(r.error)throw r.error;ownerMap=new Map((r.data||[]).map(p=>[String(p.id),p.display_name||p.username||"未命名人員"]));}
  // Supabase 單次查詢預設最多回傳 1000 列；逐個牌靴做精確 count，避免 50 副清單局數被截斷。
  const counts=await Promise.all(shoes.map(async s=>{const r=await supabase.from("games").select("id",{count:"exact",head:true}).eq("shoe_id",s.id);if(r.error)throw r.error;return [String(s.id),r.count||0]}));
  const gameMap=new Map(counts);
  return shoes.map(s=>({...s,owner_name:ownerMap.get(String(s.owner_id))||"未指定",count:gameMap.get(String(s.id))||0}));
}
async function openFinishedHistory(){
  if(currentProfile?.role!=="admin")return;
  $("finishedHistoryModal").classList.remove("hidden");$("finishedHistoryMessage").textContent="";$("finishedHistoryList").innerHTML='<p class="empty">讀取中…</p>';
  try{const r=await supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").not("finished_at","is",null).eq("is_archived",false).order("finished_at",{ascending:false}).limit(50);if(r.error)throw r.error;finishedHistoryData=await attachAdminShoeDetails(r.data||[]);renderFinishedHistory();}
  catch(e){showMessage($("finishedHistoryMessage"),e.message||"讀取最近完成牌靴失敗","error");$("finishedHistoryList").innerHTML='<p class="empty">讀取失敗</p>';}
}
function renderFinishedHistory(){
  const q=$("finishedHistorySearch").value.trim().toLowerCase();
  const rows=finishedHistoryData.filter(s=>!q||[s.shoe_number,s.name,s.venue,s.owner_name].filter(Boolean).join(" ").toLowerCase().includes(q));
  $("finishedHistoryCount").textContent=`${rows.length} 副`;
  $("finishedHistoryList").innerHTML=rows.length?rows.map(adminRecordCard).join(""):'<p class="empty">沒有符合條件的牌靴</p>';
  document.querySelectorAll("#finishedHistoryList [data-admin-shoe-id]").forEach(b=>b.onclick=async()=>{const s=finishedHistoryData.find(x=>String(x.id)===String(b.dataset.adminShoeId));if(s)await viewShoe(s)});
}
async function loadPersonnelStatsData(){
  const [pr,sr]=await Promise.all([
    supabase.from("profiles").select("id,display_name,username,email,role,is_active").order("display_name",{ascending:true}),
    supabase.from("shoes").select("id,owner_id,finished_at").not("finished_at","is",null).eq("is_archived",false)
  ]);
  if(pr.error)throw pr.error;if(sr.error)throw sr.error;
  const now=Date.now(),d7=now-7*86400000,d30=now-30*86400000,shoes=sr.data||[];
  personnelStatsData=(pr.data||[]).map(p=>{
    const own=shoes.filter(s=>String(s.owner_id)===String(p.id)).sort((a,b)=>new Date(b.finished_at)-new Date(a.finished_at));
    return {...p,total:own.length,last7:own.filter(s=>new Date(s.finished_at).getTime()>=d7).length,last30:own.filter(s=>new Date(s.finished_at).getTime()>=d30).length,lastFinished:own[0]?.finished_at||null};
  }).sort((a,b)=>b.last30-a.last30||b.total-a.total||(a.display_name||a.username||"").localeCompare(b.display_name||b.username||"","zh-Hant"));
}
function personnelCard(p){
  return `<button class="personnel-card" data-person-id="${p.id}" type="button"><div class="personnel-card-head"><div><strong>${escapeHtml(p.display_name||p.username||"未命名人員")}</strong><small>${escapeHtml(p.username||p.email||"")}｜${p.role==="admin"?"管理員":"記錄員"}</small></div><span>${p.is_active===false?"已停用":"啟用中"}</span></div><div class="personnel-count-grid"><div><b>${p.last7}</b><small>最近 7 天</small></div><div><b>${p.last30}</b><small>最近 30 天</small></div><div><b>${p.total}</b><small>累計完成</small></div></div><div class="personnel-last">最近完成：${p.lastFinished?formatDate(p.lastFinished):"尚無完成牌靴"}</div></button>`;
}
function renderPersonnelInto(listId,countId,searchId){
  const search=$(searchId),q=(search?.value||"").trim().toLowerCase();
  const rows=personnelStatsData.filter(p=>!q||[p.display_name,p.username,p.email].filter(Boolean).join(" ").toLowerCase().includes(q));
  if($(countId))$(countId).textContent=`${rows.length} 人`;
  const list=$(listId);if(!list)return;
  list.innerHTML=rows.length?rows.map(personnelCard).join(""):'<p class="empty">沒有符合條件的人員</p>';
  list.querySelectorAll("[data-person-id]").forEach(b=>b.onclick=()=>openPersonnelDetail(b.dataset.personId));
}
async function loadPersonnelStatsInline(){
  if(currentProfile?.role!=="admin")return;
  $("dashboardPersonnelMessage").textContent="";
  try{await loadPersonnelStatsData();renderPersonnelInto("dashboardPersonnelList","dashboardPersonnelCount","dashboardPersonnelSearch");}
  catch(e){showMessage($("dashboardPersonnelMessage"),e.message||"讀取人員統計失敗","error");$("dashboardPersonnelList").innerHTML='<p class="empty">讀取失敗</p>';}
}
async function openPersonnelStats(){
  if(currentProfile?.role!=="admin")return;
  $("personnelStatsModal").classList.remove("hidden");$("personnelStatsMessage").textContent="";$("personnelStatsList").innerHTML='<p class="empty">讀取中…</p>';
  try{await loadPersonnelStatsData();renderPersonnelStats();}
  catch(e){showMessage($("personnelStatsMessage"),e.message||"讀取人員統計失敗","error");$("personnelStatsList").innerHTML='<p class="empty">讀取失敗</p>';}
}
function renderPersonnelStats(){renderPersonnelInto("personnelStatsList","personnelCount","personnelSearch");}

async function openPersonnelDetail(personId){
  if(currentProfile?.role!=="admin")return;
  selectedPersonnel=personnelStatsData.find(p=>String(p.id)===String(personId));if(!selectedPersonnel)return;
  $("personnelDetailModal").classList.remove("hidden");$("personnelDetailTitle").textContent=selectedPersonnel.display_name||selectedPersonnel.username||"人員牌靴細項";$("personnelDetailMeta").textContent=`${selectedPersonnel.username||selectedPersonnel.email||""}｜最近完成牌靴`;$("personnelDetailList").innerHTML='<p class="empty">讀取中…</p>';
  $("personnelDetailSummary").innerHTML=`<div><b>${selectedPersonnel.last7}</b><small>最近 7 天</small></div><div><b>${selectedPersonnel.last30}</b><small>最近 30 天</small></div><div><b>${selectedPersonnel.total}</b><small>累計完成</small></div>`;
  try{const r=await supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").eq("owner_id",personId).not("finished_at","is",null).eq("is_archived",false).order("finished_at",{ascending:false}).limit(50);if(r.error)throw r.error;const rows=(await attachAdminShoeDetails(r.data||[])).map(s=>({...s,owner_name:selectedPersonnel.display_name||selectedPersonnel.username||"未命名人員"}));$("personnelDetailList").innerHTML=rows.length?rows.map(adminRecordCard).join(""):'<p class="empty">此人員尚無已完成牌靴</p>';document.querySelectorAll("#personnelDetailList [data-admin-shoe-id]").forEach(b=>b.onclick=async()=>{const s=rows.find(x=>String(x.id)===String(b.dataset.adminShoeId));if(s)await viewShoe(s)});}
  catch(e){$("personnelDetailList").innerHTML=`<p class="empty">${escapeHtml(e.message||"讀取失敗")}</p>`;}
}

async function searchDashboardShoes(){
  const input=$("dashboardShoeSearchInput"),box=$("dashboardSearchResults"),q=input.value.trim();
  if(!q){box.classList.add("hidden");box.innerHTML="";return}
  box.classList.remove("hidden");box.innerHTML='<p class="empty">搜尋中…</p>';
  const safe=q.replace(/[%_,]/g," ").trim();
  try{
    const {data,error}=await supabase.from("shoes").select("id,shoe_number,name,venue,status,owner_id,created_at,recording_started_at,finished_at,is_archived").or(`shoe_number.ilike.%${safe}%,name.ilike.%${safe}%,venue.ilike.%${safe}%`).order("created_at",{ascending:false}).limit(20);
    if(error)throw error;
    const rows=data||[];
    box.innerHTML=rows.length?rows.map(s=>`<button class="dashboard-search-row" data-search-shoe-id="${s.id}" type="button"><strong>${escapeHtml(s.shoe_number||"未命名")}</strong><span>${escapeHtml(s.venue||"未選場館")}｜${s.status==="open"?"進行中":"已完成"}｜${formatDate(s.finished_at||s.created_at)}</span></button>`).join(""):'<p class="empty">找不到符合的牌靴</p>';
    document.querySelectorAll("[data-search-shoe-id]").forEach(b=>b.onclick=async()=>{const shoe=rows.find(s=>String(s.id)===String(b.dataset.searchShoeId));if(shoe)await viewShoe(shoe)});
  }catch(e){box.innerHTML=`<p class="empty">${escapeHtml(e.message||"搜尋失敗")}</p>`}
}

function isModalOpen(id){
  const el=$(id); return !!el && !el.classList.contains("hidden");
}
function scheduleRealtimeReload(reason="資料更新"){
  if(!currentUser)return;
  clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer=setTimeout(async()=>{
    try{
      await loadCloudData();
      if(reason) showSaveToast(`↻ ${reason}`);
    }catch(e){
      console.error("Realtime reload failed",e);
      setSync("同步失敗","error");
    }
  },220);
}
function scheduleManagerReload(kind){
  if(currentProfile?.role!=="admin")return;
  clearTimeout(realtimeManagerTimer);
  realtimeManagerTimer=setTimeout(async()=>{
    try{
      if(kind==="shoes" && isModalOpen("shoeManagerModal")) await openShoeManager();
      if(kind==="users" && isModalOpen("userManagerModal")) await loadManagedUsers();
    }catch(e){console.error("Realtime manager refresh failed",e)}
  },320);
}
async function stopRealtime(){
  realtimeGeneration+=1;
  clearTimeout(realtimeReloadTimer);clearTimeout(realtimeManagerTimer);clearTimeout(realtimeReconnectTimer);clearTimeout(dashboardRefreshTimer);
  const channels=[...realtimeChannels];realtimeChannels=[];realtimeJoinedCount=0;
  await Promise.all(channels.map(channel=>supabase.removeChannel(channel).catch(()=>null)));
}
function updateRealtimeConnection(status,generation){
  if(generation!==realtimeGeneration)return;
  if(status==="SUBSCRIBED"){
    realtimeJoinedCount+=1;
    if(realtimeJoinedCount>=realtimeChannels.length)setSync("即時連線","ok");
    return;
  }
  if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
    setSync(navigator.onLine?"重新連線中":"已離線",navigator.onLine?"pending":"error");
    clearTimeout(realtimeReconnectTimer);
    if(navigator.onLine)realtimeReconnectTimer=setTimeout(()=>startRealtime(),1800);
  }
}
async function startRealtime(){
  if(!currentUser)return;
  await stopRealtime();
  const generation=realtimeGeneration;
  realtimeJoinedCount=0;
  setSync(navigator.onLine?"連線中":"已離線",navigator.onLine?"pending":"error");

  const dataChannel=supabase.channel(`studio-data-${currentUser.id}-${generation}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"shoes"},payload=>{
      scheduleRealtimeReload(payload.eventType==="INSERT"?"牌靴已建立":"牌靴狀態已更新");
      scheduleManagerReload("shoes");
      scheduleDashboardReload();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"games"},payload=>{
      const changedShoe=payload.new?.shoe_id||payload.old?.shoe_id;
      if(!currentShoe||String(changedShoe)===String(currentShoe.id))scheduleRealtimeReload("牌局已同步");
      scheduleManagerReload("shoes");
      scheduleDashboardReload();
    })
    .subscribe(status=>updateRealtimeConnection(status,generation));

  const profileFilter=currentProfile?.role==="admin"?undefined:`id=eq.${currentUser.id}`;
  const profileConfig={event:"*",schema:"public",table:"profiles"};
  if(profileFilter)profileConfig.filter=profileFilter;
  const profileChannel=supabase.channel(`studio-profiles-${currentUser.id}-${generation}`)
    .on("postgres_changes",profileConfig,async payload=>{
      scheduleManagerReload("users");
      scheduleDashboardReload();
      if(String(payload.new?.id||payload.old?.id)===String(currentUser.id)){
        try{currentProfile=await loadCurrentProfile(currentUser);applyRoleUI()}catch(e){console.error(e)}
      }
    })
    .subscribe(status=>updateRealtimeConnection(status,generation));

  const presenceChannel=supabase.channel("studio-presence-v162",{config:{presence:{key:currentUser.id}}})
    .on("presence",{event:"sync"},()=>flattenPresence(presenceChannel.presenceState()))
    .on("presence",{event:"join"},()=>flattenPresence(presenceChannel.presenceState()))
    .on("presence",{event:"leave"},()=>flattenPresence(presenceChannel.presenceState()))
    .subscribe(async status=>{
      updateRealtimeConnection(status,generation);
      if(status==="SUBSCRIBED")await presenceChannel.track({user_id:currentUser.id,display_name:currentProfile?.display_name||currentProfile?.username,role:currentProfile?.role,online_at:new Date().toISOString()});
    });

  realtimeChannels=[dataChannel,profileChannel,presenceChannel];
}
window.addEventListener("offline",()=>setSync("已離線","error"));
window.addEventListener("online",()=>{setSync("重新連線中","pending");startRealtime()});

function usernameToInternalEmail(value){
  const account=String(value||"").trim().toLowerCase();
  return account.includes("@")?account:`${account}@baccarat.local`;
}
async function login(){
  if(busy)return;
  const account=$("emailInput").value.trim(),password=$("passwordInput").value;
  if(!account||!password)return showMessage(loginMessage,"請輸入帳號和密碼","error");
  const email=usernameToInternalEmail(account);
  setBusy(true);
  try{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error}
  catch{showMessage(loginMessage,"登入失敗，請確認帳號或密碼","error")}
  finally{setBusy(false)}
}
async function logout(){await supabase.auth.signOut()}
async function loadCurrentProfile(user){
  const {data,error}=await supabase.from("profiles").select("id,email,username,display_name,role,is_active,ai_capture_enabled").eq("id",user.id).maybeSingle();
  if(error) throw error;
  if(!data) throw new Error("找不到使用者資料，請先執行 v16.1.0 資料庫升級 SQL");
  if(data.is_active===false){await supabase.auth.signOut();throw new Error("此帳號已被停用，請聯絡管理員");}
  return data;
}
function applyRoleUI(){
  const isAdmin=currentProfile?.role==="admin";
  $("userDisplayName").textContent=currentProfile?.display_name||currentProfile?.email||"使用者";
  $("userRoleBadge").textContent=isAdmin?"管理員":"記錄員";
  $("userRoleBadge").className=`role-badge ${isAdmin?"admin":"recorder"}`;
  $("manageShoesButton").classList.toggle("hidden",!isAdmin);
  $("userManagerButton").classList.toggle("hidden",!isAdmin);
  $("dashboardButton").classList.toggle("hidden",!isAdmin);
  const allowAi=aiAllowed();
  $("aiInputMethod").classList.toggle("hidden",!allowAi);
  if(!allowAi&&inputMethod==="ai")setInputMethod("manual");
  if(!isAdmin && !document.getElementById("recorderNotice")){
    const note=document.createElement("div");note.id="recorderNotice";note.className="recorder-note";
    note.textContent="記錄員模式：可建立與記錄牌靴；牌靴管理功能僅限管理員。";
    $("appMessage").insertAdjacentElement("afterend",note);
  }
  if(isAdmin) document.getElementById("recorderNotice")?.remove();
}
async function showAuthenticated(session){
  currentUser=session.user;
  try{
    currentProfile=await loadCurrentProfile(session.user);
    loginPanel.classList.add("hidden");appPanel.classList.remove("hidden");userArea.classList.remove("hidden");
    applyRoleUI();
    await Promise.all([loadCloudData(),loadVenues()]);
    await startRealtime();
  }catch(e){
    console.error(e);showMessage(loginMessage,e.message||"登入資料讀取失敗","error");
    loginPanel.classList.remove("hidden");appPanel.classList.add("hidden");userArea.classList.add("hidden");
  }
}
function showLoggedOut(){closeAiCamera();stopRealtime();loginPanel.classList.remove("hidden");appPanel.classList.add("hidden");userArea.classList.add("hidden");currentUser=null;currentProfile=null;currentShoe=null;currentGames=[];setSync("準備中","pending")}



async function openAiCamera(){
  if(!aiAllowed()||inputMethod!=="ai"||busy)return;
  const modal=$("cameraCaptureModal"),video=$("cameraVideo"),status=$("cameraStatus"),shutter=$("captureCameraButton");
  modal.classList.remove("hidden");
  status.textContent="正在啟動相機…";status.classList.remove("hidden");shutter.disabled=true;
  try{
    stopAiCameraStream();
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:3840,min:1920},height:{ideal:2160,min:1080}},audio:false
    });
    video.srcObject=cameraStream;
    await video.play();
    if(video.readyState<2)await new Promise(resolve=>video.addEventListener("loadeddata",resolve,{once:true}));
    const track=cameraStream.getVideoTracks()[0];
    try{
      const caps=track?.getCapabilities?.()||{};
      if(caps.focusMode?.includes?.("continuous")) await track.applyConstraints({advanced:[{focusMode:"continuous"}]});
      if(caps.zoom){
        const target=Math.min(caps.zoom.max||1.5,Math.max(caps.zoom.min||1,1.35));
        await track.applyConstraints({advanced:[{zoom:target}]});
      }
    }catch(constraintError){console.warn("camera enhancement fallback",constraintError);}
    const previous=$("cameraPreviousResult");
    if(previous){
      clearTimeout(previous._timer);
      previous.textContent=lastSavedCameraResult;
      previous.classList.toggle("hidden",!lastSavedCameraResult);
      if(lastSavedCameraResult){
        previous._timer=setTimeout(()=>{
          previous.classList.add("hidden");
          previous.textContent="";
          lastSavedCameraResult="";
        },3000);
      }
    }
    status.classList.add("hidden");shutter.disabled=false;
  }catch(error){
    console.error(error);status.textContent="無法開啟相機，請確認瀏覽器相機權限";shutter.disabled=true;
  }
}
function stopAiCameraStream(){
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;}
  const video=$("cameraVideo");if(video)video.srcObject=null;
}
function closeAiCamera(){
  stopAiCameraStream();
  $("cameraCaptureModal")?.classList.add("hidden");
}
async function captureAiCameraFrame(){
  const video=$("cameraVideo"),guide=$("cameraGuide"),shutter=$("captureCameraButton");
  if(!cameraStream||!video.videoWidth||!video.videoHeight)return;
  shutter.disabled=true;
  try{
    const vr=video.getBoundingClientRect(),gr=guide.getBoundingClientRect();
    const scale=Math.max(vr.width/video.videoWidth,vr.height/video.videoHeight);
    const displayedW=video.videoWidth*scale,displayedH=video.videoHeight*scale;
    const offsetX=(displayedW-vr.width)/2,offsetY=(displayedH-vr.height)/2;
    let sx=(gr.left-vr.left+offsetX)/scale;
    let sy=(gr.top-vr.top+offsetY)/scale;
    let sw=gr.width/scale,sh=gr.height/scale;
    sx=Math.max(0,Math.min(video.videoWidth-1,sx));sy=Math.max(0,Math.min(video.videoHeight-1,sy));
    sw=Math.max(1,Math.min(video.videoWidth-sx,sw));sh=Math.max(1,Math.min(video.videoHeight-sy,sh));
    const canvas=document.createElement("canvas");
    const maxWidth=2400,ratio=Math.min(1,maxWidth/sw);
    canvas.width=Math.max(1,Math.round(sw*ratio));canvas.height=Math.max(1,Math.round(sh*ratio));
    const ctx=canvas.getContext("2d",{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.filter="contrast(1.12) saturate(1.05)";
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    ctx.filter="none";
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("拍照失敗")),"image/jpeg",.95));
    const file=new File([blob],`capture-${Date.now()}.jpg`,{type:"image/jpeg"});
    closeAiCamera();
    await analyzeCapturedPhoto(file);
  }catch(error){
    console.error(error);showMessage(appMessage,error.message||"拍照失敗，請重新拍照","error");
    shutter.disabled=false;
  }
}

async function fileToDataUrl(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>typeof reader.result==="string"?resolve(reader.result):reject(new Error("照片讀取失敗"));
    reader.onerror=()=>reject(new Error("照片讀取失敗"));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToImage(dataUrl){
  return await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("照片解碼失敗"));
    img.src=dataUrl;
  });
}

async function buildRoiSheet(imageDataUrl){
  const img=await dataUrlToImage(imageDataUrl);
  const canvas=document.createElement("canvas");
  canvas.width=1280; canvas.height=980;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx) throw new Error("無法建立辨識畫布");
  ctx.fillStyle="#101722";ctx.fillRect(0,0,canvas.width,canvas.height);
  const drawLabel=(label,cx,y)=>{ctx.fillStyle="#fff";ctx.font="bold 24px sans-serif";ctx.textAlign="center";ctx.fillText(label,cx,y);};
  const crop=(x,y,w,h)=>({sx:x*img.width,sy:y*img.height,sw:w*img.width,sh:h*img.height});
  const drawCrop=(label,x,y,w,h,dx,dy,dw,dh,{rotate=false}={})=>{
    drawLabel(label,dx+dw/2,dy-10);
    const c=crop(x,y,w,h);
    ctx.save();ctx.beginPath();ctx.rect(dx,dy,dw,dh);ctx.clip();
    ctx.filter="contrast(1.18) saturate(1.05)";
    if(rotate){
      ctx.translate(dx+dw/2,dy+dh/2);ctx.rotate(-Math.PI/2);
      ctx.drawImage(img,c.sx,c.sy,c.sw,c.sh,-dh/2,-dw/2,dh,dw);
    }else ctx.drawImage(img,c.sx,c.sy,c.sw,c.sh,dx,dy,dw,dh);
    ctx.filter="none";ctx.restore();
    ctx.strokeStyle="#74d3ff";ctx.lineWidth=3;ctx.strokeRect(dx,dy,dw,dh);
  };
  drawCrop("SCORE / HEADER",.03,.01,.94,.25,80,48,1120,185);
  drawCrop("P1",.08,.25,.22,.38,30,300,270,250);
  drawCrop("P2",.27,.25,.22,.38,330,300,270,250);
  drawCrop("B1",.50,.25,.22,.38,680,300,270,250);
  drawCrop("B2",.69,.25,.22,.38,980,300,270,250);
  drawCrop("P3 ROTATED",.15,.52,.31,.42,120,650,400,260,{rotate:true});
  drawCrop("B3 ROTATED",.54,.52,.31,.42,760,650,400,260,{rotate:true});
  const dataUrl=canvas.toDataURL("image/jpeg",.91);
  if(typeof dataUrl!=="string" || !dataUrl.startsWith("data:image/") || dataUrl.length<2000) throw new Error("六格辨識圖建立失敗");
  return dataUrl;
}

async function analyzeCapturedPhoto(file){
  if(!file||!aiAllowed()||busy)return;
  resetAiCapture();aiCapture.file=file;aiCapture.objectUrl=URL.createObjectURL(file);aiCapture.recognizing=true;
  cardState=freshCardState();renderCardInput();updateRecordState();setBusy(true);
  try{
    const image=await fileToDataUrl(file);
    let roiSheet=null;
    try{ roiSheet=await buildRoiSheet(image); }
    catch(roiError){ console.warn("ROI sheet fallback",roiError); }
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error("登入已失效");
    const payload={image,template:"dreamgaming_roi_v3_six_guides"};
    if(typeof roiSheet==="string"&&roiSheet.startsWith("data:image/")) payload.roi_sheet=roiSheet;
    const response=await fetch(AI_CAPTURE_FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));if(!response.ok||result.ok===false)throw new Error(result.error||result.warning||`辨識服務錯誤（${response.status}）`);
    const cards=result.cards||{};
    cardState={player:[cards.player_1||null,cards.player_2||null,cards.player_3||null],banker:[cards.banker_1||null,cards.banker_2||null,cards.banker_3||null],active:"complete"};
    aiCapture.autoSlots={player:cardState.player.map(Boolean),banker:cardState.banker.map(Boolean)};
    aiCapture.confirmed={player:[false,false,false],banker:[false,false,false]};
    aiCapture.diagnostics=result.diagnostics||null;
    aiCapture.expectedPlayerPoints=Number.isInteger(result.player_points)?result.player_points:null;
    aiCapture.expectedBankerPoints=Number.isInteger(result.banker_points)?result.banker_points:null;
    aiCapture.warning=result.warning||"";
    aiCapture.reviewRequired=result.review_required===true;
    // 最終是否需要人工處理，以前端確定性驗證為準：
    // 起手牌完整、補牌規則正確、最終點數與畫面一致時，直接開放下一局。
    const localCheck=aiValidation();
    if(localCheck.complete&&localCheck.valid){
      aiCapture.reviewRequired=false;
      aiCapture.warning="";
      showSaveToast("✓ 辨識與規則驗證通過，可直接下一局");
    }else{
      aiCapture.reviewRequired=true;
      showSaveToast("辨識完成，請補正有疑問的牌","warning");
    }
  }catch(e){
    console.error(e);cardState=freshCardState();showMessage(appMessage,e.message||"辨識失敗，請重新拍照","error");aiCapture.warning=e.message||"辨識失敗，請重新拍照";
  }finally{aiCapture.recognizing=false;setBusy(false);renderCardInput();updateRecordState();}
}

async function callUserAdmin(action,payload={}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error("登入已失效，請重新登入");
  const response=await fetch(USER_ADMIN_FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({action,...payload})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||`人員管理服務錯誤（${response.status}）`);
  return result;
}
function closeUserManager(){if(!busy)$("userManagerModal").classList.add("hidden")}
async function openUserManager(){
  if(currentProfile?.role!=="admin")return;
  $("userManagerModal").classList.remove("hidden");
  $("userManagerMessage").textContent="";
  await loadManagedUsers();
}
async function loadManagedUsers(){
  $("userManagerList").innerHTML='<p class="empty">讀取中…</p>';
  try{const result=await callUserAdmin("list");managedUsers=result.users||[];renderManagedUsers()}
  catch(e){$("userManagerList").innerHTML='<p class="empty">讀取失敗</p>';showMessage($("userManagerMessage"),e.message||"讀取人員失敗","error")}
}
function renderManagedUsers(){
  $("userManagerList").innerHTML=managedUsers.length?managedUsers.map(u=>{
    const admin=u.role==="admin",self=u.id===currentUser?.id,active=u.is_active!==false,ai=admin||u.ai_capture_enabled===true;
    const online=isOnlineUser(u.id);return `<div class="user-manager-row"><div><strong><span class="presence-dot ${online?"online":"offline"}"></span>${escapeHtml(u.display_name||u.email)}</strong><small>${escapeHtml(u.username||u.email)}｜${online?"目前在線":"目前離線"}</small></div><span class="role-badge ${admin?"admin":"recorder"}">${admin?"管理員":"記錄員"}</span><span class="account-state ${active?"active":"disabled"}">${active?"啟用":"停用"}</span><div class="ai-permission"><span>AI 辨識</span><i class="permission-light ${ai?"on":"off"}" aria-label="${ai?"可使用":"不可使用"}"></i></div><div class="user-actions">${admin?"":`<button class="secondary" data-user-action="password" data-id="${u.id}">重設密碼</button><button class="${active?"danger":"success"}" data-user-action="active" data-id="${u.id}">${active?"停用":"啟用"}</button><button class="secondary" data-user-action="ai" data-id="${u.id}">切換 AI</button><button class="delete-user" data-user-action="delete" data-id="${u.id}">刪除人員</button>`}${self?'<span class="self-label">目前帳號</span>':""}</div></div>`
  }).join(""):'<p class="empty">尚無人員資料</p>';
  document.querySelectorAll("[data-user-action]").forEach(b=>b.onclick=()=>handleManagedUserAction(b.dataset.userAction,b.dataset.id));
}
async function createManagedUser(){
  if(busy)return;
  const display_name=$("newUserName").value.trim(),username=$("newUsername").value.trim().toLowerCase(),password=$("newUserPassword").value;
  if(!display_name||!username||password.length<8)return showMessage($("userManagerMessage"),"請填寫名稱、帳號，密碼至少 8 碼","error");
  if(!/^[a-z0-9._-]{3,30}$/.test(username))return showMessage($("userManagerMessage"),"帳號限 3～30 碼小寫英文、數字、點、底線或連字號","error");
  setBusy(true);try{await callUserAdmin("create",{display_name,username,password});$("newUserName").value="";$("newUsername").value="";$("newUserPassword").value="";showSaveToast("✓ 記錄員已建立");await loadManagedUsers()}
  catch(e){showMessage($("userManagerMessage"),e.message||"建立失敗","error")}finally{setBusy(false)}
}
async function handleManagedUserAction(action,id){
  const user=managedUsers.find(u=>u.id===id);if(!user||user.role==="admin")return;
  if(action==="password"){
    const password=prompt(`請輸入 ${user.display_name||user.email} 的新密碼（至少 8 碼）`);if(password===null)return;if(password.length<8)return showMessage($("userManagerMessage"),"密碼至少 8 碼","error");
    setBusy(true);try{await callUserAdmin("reset_password",{user_id:id,password});showSaveToast("✓ 密碼已重設")}catch(e){showMessage($("userManagerMessage"),e.message||"重設失敗","error")}finally{setBusy(false)}
  }
  if(action==="active"){
    const active=user.is_active===false;if(!confirm(`確定要${active?"啟用":"停用"} ${user.display_name||user.email} 嗎？`))return;
    setBusy(true);try{await callUserAdmin("set_active",{user_id:id,is_active:active});showSaveToast(active?"✓ 帳號已啟用":"✓ 帳號已停用");await loadManagedUsers()}catch(e){showMessage($("userManagerMessage"),e.message||"操作失敗","error")}finally{setBusy(false)}
  }
  if(action==="ai"){
    const enabled=user.ai_capture_enabled!==true;
    setBusy(true);try{await callUserAdmin("set_ai_capture",{user_id:id,enabled});showSaveToast(enabled?"✓ AI 辨識權限已開啟":"✓ AI 辨識權限已關閉");await loadManagedUsers()}catch(e){showMessage($("userManagerMessage"),e.message||"AI 權限更新失敗","error")}finally{setBusy(false)}
  }
  if(action==="delete"){
    const name=user.display_name||user.username||user.email;
    const confirmed=confirm(`確定要永久刪除「${name}」嗎？\n\n只有尚未建立任何牌靴或牌局紀錄的人員才能永久刪除。此操作無法復原。`);
    if(!confirmed)return;
    const typed=prompt(`為避免誤刪，請輸入「刪除」確認永久刪除 ${name}`);
    if(typed!=="刪除")return showMessage($("userManagerMessage"),"已取消刪除","error");
    setBusy(true);
    try{
      await callUserAdmin("delete",{user_id:id});
      showSaveToast("✓ 人員已永久刪除");
      await loadManagedUsers();
    }catch(e){
      showMessage($("userManagerMessage"),e.message||"刪除失敗","error");
    }finally{setBusy(false)}
  }
}

$("modeComplete").onclick=()=>setMode("complete");
$("modeWinnerOnly").onclick=()=>setMode("winner_only");
$("manualInputMethod").onclick=()=>setInputMethod("manual");
$("aiInputMethod").onclick=()=>setInputMethod("ai");
$("aiCameraButton").onclick=openAiCamera;
$("closeCameraButton").onclick=closeAiCamera;
$("captureCameraButton").onclick=captureAiCameraFrame;
$("nextRoundButton").onclick=saveAndNext;
document.querySelectorAll(".winner-button").forEach(b=>b.onclick=()=>{winnerOnlyState.winner=b.dataset.winner;if(winnerOnlyState.winner!=="莊")winnerOnlyState.superSix=false;updateWinnerOnlyUI();updateRecordState()});
$("winnerPlayerPair").onclick=()=>{winnerOnlyState.playerPair=!winnerOnlyState.playerPair;updateWinnerOnlyUI()};
$("winnerBankerPair").onclick=()=>{winnerOnlyState.bankerPair=!winnerOnlyState.bankerPair;updateWinnerOnlyUI()};
$("winnerSuperSix").onclick=()=>{if(winnerOnlyState.winner==="莊"){winnerOnlyState.superSix=!winnerOnlyState.superSix;updateWinnerOnlyUI()}};
$("newShoeButton").onclick=openShoeModal;$("finishShoeButton").onclick=finishCurrentShoe;$("confirmShoeButton").onclick=createNewShoe;$("addVenueButton").onclick=addVenue;$("closeShoeModal").onclick=closeShoeModal;$("cancelShoeButton").onclick=closeShoeModal;document.querySelector("[data-close-modal]").onclick=closeShoeModal;
$("myRecentShoesButton").onclick=openMyRecentShoes;$("closeMyRecentShoesModal").onclick=closeMyRecentShoes;document.querySelector("[data-close-my-recent-shoes]").onclick=closeMyRecentShoes;
$("manageShoesButton").onclick=openShoeManager;$("closeManagerModal").onclick=closeManagerModal;document.querySelector("[data-close-manager]").onclick=closeManagerModal;$("shoeSearchInput").oninput=renderShoeManager;$("shoeStatusFilter").onchange=renderShoeManager;
$("closeDetailModal").onclick=closeDetailModal;document.querySelector("[data-close-detail]").onclick=closeDetailModal;$("closeEditModal").onclick=closeEditModal;$("cancelEditShoeButton").onclick=closeEditModal;document.querySelector("[data-close-edit]").onclick=closeEditModal;$("saveEditShoeButton").onclick=saveEditedShoe;
$("dashboardButton").onclick=openDashboard;$("closeDashboardModal").onclick=closeDashboard;document.querySelector("[data-close-dashboard]").onclick=closeDashboard;$("refreshDashboardButton").onclick=()=>loadDashboard();$("dashboardShoeSearchButton").onclick=searchDashboardShoes;$("dashboardShoeSearchInput").addEventListener("keydown",e=>{if(e.key==="Enter")searchDashboardShoes()});
document.querySelectorAll("[data-dashboard-view]").forEach(b=>b.onclick=()=>openManagementList(b.dataset.dashboardView));$("closeManagementListModal").onclick=closeManagementList;document.querySelector("[data-close-management-list]").onclick=closeManagementList;$("managementListSearch").addEventListener("input",renderManagementList);
$("openFinishedHistoryButton").onclick=openFinishedHistory;$("closeFinishedHistoryModal").onclick=closeFinishedHistory;document.querySelector("[data-close-finished-history]").onclick=closeFinishedHistory;$("finishedHistorySearch").addEventListener("input",renderFinishedHistory);
$("closePersonnelStatsModal").onclick=closePersonnelStats;document.querySelector("[data-close-personnel-stats]").onclick=closePersonnelStats;$("personnelSearch").addEventListener("input",renderPersonnelStats);$("dashboardPersonnelSearch").addEventListener("input",()=>renderPersonnelInto("dashboardPersonnelList","dashboardPersonnelCount","dashboardPersonnelSearch"));
$("closePersonnelDetailModal").onclick=closePersonnelDetail;document.querySelector("[data-close-personnel-detail]").onclick=closePersonnelDetail;
$("userManagerButton").onclick=openUserManager;$("closeUserManagerModal").onclick=closeUserManager;document.querySelector("[data-close-users]").onclick=closeUserManager;$("createUserButton").onclick=createManagedUser;$("refreshUsersButton").onclick=loadManagedUsers;
$("undoButton").onclick=deleteLastGame;$("refreshButton").onclick=async()=>{try{await Promise.all([loadCloudData(),loadVenues()])}catch(e){showMessage(appMessage,e.message||"重新整理失敗","error")}};$("loginButton").onclick=login;$("logoutButton").onclick=logout;
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("shoeDetailModal").classList.contains("hidden"))return closeDetailModal();if(!$("managementListModal").classList.contains("hidden"))return closeManagementList();if(!$("personnelDetailModal").classList.contains("hidden"))return closePersonnelDetail();if(!$("personnelStatsModal").classList.contains("hidden"))return closePersonnelStats();if(!$("finishedHistoryModal").classList.contains("hidden"))return closeFinishedHistory();if(!$("myRecentShoesModal").classList.contains("hidden"))return closeMyRecentShoes();if(!$("dashboardModal").classList.contains("hidden"))return closeDashboard();if(!$("userManagerModal").classList.contains("hidden"))return closeUserManager();if(!$("editShoeModal").classList.contains("hidden"))return closeEditModal();if(!$("shoeManagerModal").classList.contains("hidden"))return closeManagerModal();if(!$("newShoeModal").classList.contains("hidden"))return closeShoeModal()}if(e.key==="Enter"&&!loginPanel.classList.contains("hidden"))login()});

syncNextRoundPlacement();renderCardInput();updateWinnerOnlyUI();updateRecordState();
supabase.auth.onAuthStateChange(async(_event,session)=>session?await showAuthenticated(session):showLoggedOut());
const {data:{session}}=await supabase.auth.getSession();if(session)await showAuthenticated(session);else showLoggedOut();
