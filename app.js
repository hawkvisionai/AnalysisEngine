(() => {
  "use strict";

  const cfg = window.HAWKVISION_CONFIG || {};
  const state = {
    rounds: [],
    analysisStarted: false,
    pendingPrediction: null,
    // 每一局對正確／錯誤的影響，用於撤銷時同步還原。
    evaluations: [],
    correct: 0,
    wrong: 0,
    isAnalyzing: false,
    strategyMethod: null,
    historyIndex: null,
    historyLoading: null
  };

  const SESSION_KEY = "hawkvision_active_shoe_v25";

  const $ = id => document.getElementById(id);
  const els = {
    grid: $("beadGrid"), dbStatus: $("dbStatus"), lookback: $("lookback"),
    analyzeBtn: $("analyzeBtn"), undoBtn: $("undoBtn"), newShoeBtn: $("newShoeBtn"),
    roundCount: $("roundCount"), decisionCard: $("decisionCard"), decision: $("decisionValue"), decisionPercent: $("decisionPercent"), confidence: $("confidenceValue"),
    warning: $("warning"), streakStatus: $("streakStatus"),
    maxWinStreak: $("maxWinStreak"), maxLossStreak: $("maxLossStreak"),
    correct: $("correctCount"), wrong: $("wrongCount"), accuracy: $("accuracyRate"),
    bankerTotal: $("bankerTotal"), playerTotal: $("playerTotal"), tieTotal: $("tieTotal"),
    totalRounds: $("totalRounds"), modal: $("confirmModal"),
    cancelNewShoe: $("cancelNewShoe"), confirmNewShoe: $("confirmNewShoe"),
    toast: $("toast"), advancedMode: $("advancedMode")
  };

  const BASIC_MIN_HISTORY = 10;
  const BASIC_INDEX_CACHE_KEY = "hv-basic-d-index-v2";
  const BASIC_INDEX_TTL_MS = 6*60*60*1000;
  const D9_METHODS = new Set(["reverse7","reverse8","d9_1137","d9_113715","d9_11371531_wait","d9_1371531_wait","d9_1371531_nostop"]);

  function normalizeWinner(winner) {
    const x=String(winner??"").trim().toLowerCase();
    if (winner==="莊" || ["b","banker","庄","bank"].includes(x)) return "莊";
    if (winner==="閒" || ["p","player","闲","play"].includes(x)) return "閒";
    if (winner==="和" || ["t","tie","和局"].includes(x)) return "和";
    return null;
  }

  function outcomeCode(winner) {
    const x=normalizeWinner(winner);
    return x === "莊" ? "B" : x === "閒" ? "P" : null;
  }

  function outcomeCodeWithTie(winner) {
    const x=normalizeWinner(winner);
    return x === "莊" ? "B" : x === "閒" ? "P" : x === "和" ? "T" : null;
  }

  function runSig(codes) {
    if (!codes.length) return "";
    const last = codes[codes.length - 1];
    let streak = 1;
    for (let i = codes.length - 2; i >= 0; i -= 1) { if (codes[i] === last) streak += 1; else break; }
    let transitions = 0, max = 1, cur = 1;
    for (let i = 1; i < codes.length; i += 1) {
      if (codes[i] !== codes[i - 1]) { transitions += 1; cur = 1; }
      else { cur += 1; max = Math.max(max, cur); }
    }
    return `${last}|${Math.min(streak,4)}|${Math.min(transitions,6)}|${Math.min(max,5)}`;
  }

  async function loadBasicHistoryIndex() {
    if (state.historyIndex) return state.historyIndex;
    if (state.historyLoading) return state.historyLoading;
    state.historyLoading = (async () => {
      try {
        const cached = JSON.parse(sessionStorage.getItem(BASIC_INDEX_CACHE_KEY) || "null");
        if (
          cached &&
          Date.now()-Number(cached.savedAt||0) < BASIC_INDEX_TTL_MS &&
          Array.isArray(cached.m9t) &&
          Array.isArray(cached.reverseStruct) &&
          Array.isArray(cached.reverseShoes)
        ) {
          const maps={6:new Map(cached.m6||[]),9:new Map(cached.m9||[]),"9T":new Map(cached.m9t||[])};
          state.historyIndex=maps;
          state._reverseD9StructMap=new Map(cached.reverseStruct||[]);
          state._reverseD9HistoryShoes=(cached.reverseShoes||[]).map(x=>({
            shoeId:x.shoeId,
            seq:Array.isArray(x.seq)?x.seq:[],
            codes:Array.isArray(x.codes)?x.codes:[]
          }));
          state._reverseD9HistoryMeta={
            rowCount:Number(cached.reverseMeta?.rowCount||0),
            shoeCount:state._reverseD9HistoryShoes.length,
            keyCount:state._reverseD9StructMap.size,
            loadedAt:Number(cached.savedAt||Date.now()),
            source:"shared-basic-cache"
          };
          state._reverseD9LastError=null;
          return maps;
        }
      } catch (_) {}

      if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) throw new Error("歷史資料庫設定不存在");
      const historyClient = window.supabase.createClient(
        cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,
        {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
      );

      const rows = [];
      const step = 1000;
      for (let from = 0; ; from += step) {
        const { data, error } = await historyClient.from("games")
          .select("shoe_id,game_number,winner")
          .range(from, from + step - 1);
        if (error) throw error;
        const batch = Array.isArray(data) ? data : [];
        rows.push(...batch);
        if (batch.length < step) break;
        if (rows.length > 50000) throw new Error("歷史資料筆數異常");
      }

      const byShoe = new Map();
      for (const g of rows) {
        if (!byShoe.has(g.shoe_id)) byShoe.set(g.shoe_id, []);
        byShoe.get(g.shoe_id).push(g);
      }

      const maps = {6:new Map(),9:new Map(),"9T":new Map()};
      const reverseStructMap=new Map();
      const reverseShoes=[];

      for (const [shoeId,games] of byShoe.entries()) {
        games.sort((a,b) => Number(a.game_number||0) - Number(b.game_number||0));

        // 原基礎 D6 / D9：和局不佔有效局位置。
        const nonTie = games
          .map(g => ({code:outcomeCode(g.winner), winner:g.winner}))
          .filter(x => x.code);

        for (const N of [6,9]) {
          for (let j=N;j<nonTie.length;j+=1) {
            const sig=runSig(nonTie.slice(j-N,j).map(x=>x.code));
            const next=nonTie[j].winner;
            if (!(next==="莊"||next==="閒")) continue;
            let rec=maps[N].get(sig);
            if(!rec){rec={莊:0,閒:0};maps[N].set(sig,rec)}
            rec[next]+=1;
          }
        }

        // 逆平 D9：使用最近 9 個「實際 B/P/T 物理結果」，
        // 與驗證研究一致；Tie 會佔 D9 的一個位置。
        const physical = games
          .map(g => ({code:outcomeCodeWithTie(g.winner), winner:normalizeWinner(g.winner)}))
          .filter(x => x.code && x.winner);

        const shoeIndex=reverseShoes.length;
        const seq=physical.map(x=>x.winner);
        const codes=physical.map(x=>x.code);
        reverseShoes.push({shoeId,seq,codes});

        for(let j=9;j<physical.length;j+=1){
          const sig=runSig(physical.slice(j-9,j).map(x=>x.code));
          const next=physical[j].winner;

          let rec=maps["9T"].get(sig);
          if(!rec){rec={莊:0,閒:0};maps["9T"].set(sig,rec)}
          if(next==="莊"||next==="閒")rec[next]+=1;

          if(!reverseStructMap.has(sig))reverseStructMap.set(sig,[]);
          reverseStructMap.get(sig).push({next,shoe:shoeIndex,shoeId});
        }
      }

      state.historyIndex=maps;
      state._reverseD9StructMap=reverseStructMap;
      state._reverseD9HistoryShoes=reverseShoes;
      state._reverseD9HistoryMeta={
        rowCount:rows.length,
        shoeCount:reverseShoes.length,
        keyCount:reverseStructMap.size,
        loadedAt:Date.now(),
        source:"shared-basic-live"
      };
      state._reverseD9LastError=null;

      try{
        sessionStorage.setItem(BASIC_INDEX_CACHE_KEY,JSON.stringify({
          savedAt:Date.now(),
          m6:[...maps[6]],
          m9:[...maps[9]],
          m9t:[...maps["9T"]],
          reverseStruct:[...reverseStructMap],
          reverseShoes:reverseShoes.map(x=>({shoeId:x.shoeId,seq:x.seq,codes:x.codes})),
          reverseMeta:{rowCount:rows.length}
        }));
      }catch(_){}
      return maps;
    })();

    try { return await state.historyLoading; }
    finally { state.historyLoading = null; }
  }

  async function loadReverseD9StructureMap(){
    // RC54：Reverse D9 不再自行第二次查資料庫。
    // 直接共用 Basic 已驗證可工作的同一批歷史 rows，同步建立含來源牌靴的 D9 索引。
    if(state._reverseD9StructMap instanceof Map && Array.isArray(state._reverseD9HistoryShoes)){
      return {map:state._reverseD9StructMap,shoes:state._reverseD9HistoryShoes};
    }

    await loadBasicHistoryIndex();

    if(!(state._reverseD9StructMap instanceof Map) || !Array.isArray(state._reverseD9HistoryShoes)){
      state._reverseD9LastError="HV_REVERSE_SHARED_INDEX_MISSING";
      throw new Error(state._reverseD9LastError);
    }
    if(state._reverseD9StructMap.size===0 || state._reverseD9HistoryShoes.length===0){
      state._reverseD9LastError="HV_REVERSE_SHARED_INDEX_EMPTY";
      throw new Error(state._reverseD9LastError);
    }

    return {map:state._reverseD9StructMap,shoes:state._reverseD9HistoryShoes};
  }

  function detectReverseTargetShoe(rounds,shoes){
    // 只使用「已經輸入完成」的牌局做辨識，不看未來局。
    // 若目前輸入正是資料庫內某副歷史牌靴的重播，辨識唯一後，
    // 正式版會排除整副目標鞋，還原研究時 LOSO 的同一規則。
    if(!Array.isArray(shoes)||rounds.length<9)return null;
    const target=rounds.map(normalizeWinner);
    if(target.some(x=>!x))return null;

    const matches=[];
    for(let i=0;i<shoes.length;i++){
      const s=shoes[i]?.seq;
      if(!Array.isArray(s)||s.length<target.length)continue;
      let ok=true;
      for(let j=0;j<target.length;j++){
        if(s[j]!==target[j]){ok=false;break}
      }
      if(ok)matches.push(i);
      if(matches.length>1)break;
    }
    return matches.length===1?matches[0]:null;
  }

  async function searchReverseD9Structure(rounds) {
    if(rounds.length<9)return null;

    const codes=rounds.slice(-9).map(outcomeCodeWithTie);
    if(codes.some(x=>!x))return null;

    const {map,shoes}=await loadReverseD9StructureMap();
    const sig=runSig(codes);
    const source=map.get(sig)||[];
    const excludeShoe=detectReverseTargetShoe(rounds,shoes);

    // 研究版 D 核心：同結構的全部候選，排除目標鞋整副後，
    // 直接以莊/閒票數多數決；和局作為 next 時不投票。
    let B=0,P=0,sampleCount=0;
    for(const c of source){
      if(excludeShoe!==null && c.shoe===excludeShoe)continue;
      if(c.next==="莊"){B++;sampleCount++}
      else if(c.next==="閒"){P++;sampleCount++}
    }

    if(sampleCount<=0||Math.abs(B-P)<1e-9)return null;

    console.debug("[HawkVision Reverse D9]",{
      method:state.strategyMethod,
      rounds:rounds.length,
      sequence:rounds.map(outcomeCodeWithTie).join(""),
      window9:codes.join(""),
      sig,excludeShoe,B,P,sampleCount,
      result:B>P?"莊":"閒"
    });

    return {counts:{莊:B,閒:P},total:B+P,sampleCount,N:9};
  }

  async function searchRoadStructure(nonTieRounds) {
    const prefer9 = D9_METHODS.has(state.strategyMethod);
    const N = prefer9 && nonTieRounds.length >= 9 ? 9 : 6;
    if (nonTieRounds.length < N) return null;
    const maps = await loadBasicHistoryIndex();
    const codes = nonTieRounds.slice(-N).map(outcomeCode).filter(Boolean);
    const rec = maps[N].get(runSig(codes));
    if (!rec) return null;
    const total = Number(rec.莊||0) + Number(rec.閒||0);
    if (total < BASIC_MIN_HISTORY || Number(rec.莊||0) === Number(rec.閒||0)) return null;
    return { counts:{莊:Number(rec.莊||0),閒:Number(rec.閒||0)}, total, N };
  }

  async function searchSequenceCore(kind,N,rounds){
    await loadBasicHistoryIndex();
    if(rounds.length<N)return null;
    const hc=window.hvAnalysisAuthClient;
    if(!hc)throw new Error("登入資料庫連線尚未完成");
    if(!state._genericHistory){
      const rows=[];for(let from=0;;from+=1000){const {data,error}=await hc.from("games").select("shoe_id,game_number,winner").order("shoe_id",{ascending:true}).order("game_number",{ascending:true}).range(from,from+999);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)break}
      const by=new Map();for(const g of rows){if(!by.has(g.shoe_id))by.set(g.shoe_id,[]);by.get(g.shoe_id).push(g)}
      state._genericHistory=[...by.values()].map(a=>a.sort((x,y)=>Number(x.game_number)-Number(y.game_number)).map(x=>x.winner));
    }
    const target=rounds.slice(-N).map(x=>x==="莊"?"B":x==="閒"?"P":"T");let cand=[];
    const mismatch=(a,b,weighted=false)=>a.reduce((d,x,i)=>d+(x===b[i]?0:(weighted?(i+1)/N:1)),0);
    const sig=a=>{let sw=0,mx=1,cur=1;for(let i=1;i<a.length;i++){if(a[i]===a[i-1]){cur++;mx=Math.max(mx,cur)}else{sw++;cur=1}}return `${a[a.length-1]}|${cur}|${sw}|${mx}`};
    for(const shoe of state._genericHistory){for(let j=N;j<shoe.length;j++){const next=shoe[j];if(!(next==="莊"||next==="閒"))continue;const seq=shoe.slice(j-N,j).map(x=>x==="莊"?"B":x==="閒"?"P":"T");let d=mismatch(target,seq,kind==="C");if(kind==="B"&&d>1)continue;if(kind==="D"){if(sig(target)===sig(seq))d=0;else d=mismatch(target,seq,true)*1.8}cand.push({next,d})}}
    if(kind==="B"){cand.sort((a,b)=>a.d-b.d);cand=cand.slice(0,120)}else{cand.sort((a,b)=>a.d-b.d);cand=cand.slice(0,120)}
    if(cand.length<10)return null;let B=0,P=0;for(const x of cand){const w=1/(1+x.d);if(x.next==="莊")B+=w;else P+=w}if(Math.abs(B-P)<1e-9)return null;return {counts:{莊:B,閒:P},total:B+P,sampleCount:cand.length,N};
  }
  async function searchStrategyCore(){
    const m=state.strategyMethod||"";
    if(m==="reverse7"||m==="reverse8"){
      // 穩健逆平 / 均衡逆平的「分析訊號完全相同」：
      // 都是同一套 D9 + Player-only。差異只能存在於配注率與等待控制。
      return searchReverseD9Structure(state.rounds);
    }
    if(m==="b3_11371531_nostop")return searchSequenceCore("B",3,state.rounds.filter(x=>x!=="和"));
    if(m==="c10_1371531_recover")return searchSequenceCore("C",10,state.rounds.filter(x=>x!=="和"));
    return searchRoadStructure(state.rounds.filter(x=>x!=="和"));
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function setDbStatus(text, type) {
    els.dbStatus.textContent = text;
    els.dbStatus.className = `db-status ${type}`;
  }

  function setDecisionTheme(outcome = null, flash = false) {
    const themeClass =
      outcome === "莊" ? "banker-theme" :
      outcome === "閒" ? "player-theme" :
      outcome === "和" ? "tie-theme" :
      "neutral";

    els.decisionCard.className = `decision ${themeClass}`;

    if (flash && outcome) {
      void els.decisionCard.offsetWidth;
      els.decisionCard.classList.add("result-flash");
      setTimeout(() => els.decisionCard.classList.remove("result-flash"), 320);
    }
  }

  function showDecisionResult(outcome, percentText, flash = true) {
    clearWaitingStyles();
    els.decision.textContent = outcome || "—";
    els.decisionPercent.textContent = percentText || "—";
    setDecisionTheme(outcome, flash);
  }

  function clearDecisionResult() {
    els.decision.textContent = "—";
    els.decisionPercent.textContent = "—";
    setDecisionTheme(null, false);
  }

  function showInitialWaitingState() {
    els.decisionCard.className = "decision waiting-state";
    els.decision.textContent = "待命中";
    els.decisionPercent.textContent = "";

    els.confidence.textContent = "等待分析";
    els.confidence.classList.add("is-waiting");

    if (els.accuracy) {
      els.accuracy.textContent = "尚無紀錄";
      els.accuracy.classList.add("is-waiting");
    }
  }

  function showNoSignalState() {
    els.decisionCard.className = "decision waiting-state";
    els.decision.textContent = "等待有效訊號";
    els.decisionPercent.textContent = "";
    els.confidence.textContent = "暫不下注";
    els.confidence.classList.add("is-waiting");
    els.warning.classList.add("hidden");
  }

  function showCorePausedState() {
    els.decisionCard.className = "decision waiting-state";
    els.decision.textContent = "等待有效訊號";
    els.decisionPercent.textContent = "";
    els.confidence.textContent = "請繼續輸入牌局";
    els.confidence.classList.add("is-waiting");
    els.warning.classList.add("hidden");
  }

  function refreshSuggestedBet() {
    window.HawkVisionSessionPolicy?.refreshSuggestion?.();
  }

  function clearWaitingStyles() {
    els.confidence.classList.remove("is-waiting");
    if (els.accuracy) els.accuracy.classList.remove("is-waiting");
  }

  function captureExactSnapshot() {
    return {
      rounds:[...state.rounds],
      analysisStarted:state.analysisStarted,
      pendingPrediction:state.pendingPrediction,
      evaluations:[...state.evaluations],
      correct:state.correct,
      wrong:state.wrong,
      lookback:els.lookback.value,
      view:{
        decisionText:els.decision.textContent,
        decisionPercent:els.decisionPercent.textContent,
        decisionClass:els.decisionCard.className,
        confidenceText:els.confidence.textContent,
        confidenceClass:els.confidence.className,
        warningClass:els.warning.className
      }
    };
  }

  function restoreExactSnapshot(saved) {
    if (!saved || typeof saved !== "object") return false;
    state.isAnalyzing=false;
    state.rounds=Array.isArray(saved.rounds)?saved.rounds.filter(x=>["莊","閒","和"].includes(x)).slice(0,66):[];
    state.analysisStarted=Boolean(saved.analysisStarted);
    state.pendingPrediction=["莊","閒"].includes(saved.pendingPrediction)?saved.pendingPrediction:null;
    state.evaluations=Array.isArray(saved.evaluations)?saved.evaluations.slice(0,state.rounds.length):[];
    while(state.evaluations.length<state.rounds.length)state.evaluations.push(null);
    state.correct=Math.max(0,Number(saved.correct||0));
    state.wrong=Math.max(0,Number(saved.wrong||0));
    if(saved.lookback&&els.lookback.querySelector(`option[value="${saved.lookback}"]`))els.lookback.value=String(saved.lookback);

    renderAll();

    const view=saved.view&&typeof saved.view==="object"?saved.view:null;
    if(view){
      els.decision.textContent=view.decisionText??"—";
      els.decisionPercent.textContent=view.decisionPercent??"";
      els.decisionCard.className=view.decisionClass||"decision neutral";
      els.confidence.textContent=view.confidenceText??"—";
      els.confidence.className=view.confidenceClass||"";
      els.warning.className=view.warningClass||"warning hidden";
    }else if(state.analysisStarted){
      resetAnalysisDisplay();
    }else{
      showInitialWaitingState();
    }

    els.analyzeBtn.disabled=false;
    document.querySelectorAll("[data-result]").forEach(button=>{button.disabled=false});
    saveSession();
    return true;
  }

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        rounds: state.rounds,
        analysisStarted: state.analysisStarted,
        pendingPrediction: state.pendingPrediction,
        evaluations: state.evaluations,
        correct: state.correct,
        wrong: state.wrong,
        lookback: els.lookback.value,
        decision: els.decision.textContent,
        decisionPercent: els.decisionPercent.textContent,
        decisionTheme:
          els.decision.textContent === "莊" ? "莊" :
          els.decision.textContent === "閒" ? "閒" :
          els.decision.textContent === "和" ? "和" : null,
        confidence: els.confidence.textContent,
        warningVisible: !els.warning.classList.contains("hidden")
      }));
      window.hvAnalysisRuntimeSave?.(window.HawkVisionAnalysisCore?.exportState?.());
    } catch (error) {
      console.warn("無法暫存目前牌靴", error);
    }
  }

  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;

      const saved = JSON.parse(raw);
      state.rounds = Array.isArray(saved.rounds) ? saved.rounds.slice(0, 66) : [];
      state.analysisStarted = Boolean(saved.analysisStarted);
      state.pendingPrediction = saved.pendingPrediction || null;
      state.evaluations = Array.isArray(saved.evaluations)
        ? saved.evaluations.slice(0, state.rounds.length)
        : [];
      while (state.evaluations.length < state.rounds.length) state.evaluations.push(null);
      state.correct = Math.max(0, Number(saved.correct || 0));
      state.wrong = Math.max(0, Number(saved.wrong || 0));

      if (saved.lookback && els.lookback.querySelector(`option[value="${saved.lookback}"]`)) {
        els.lookback.value = saved.lookback;
      }

      els.decision.textContent = saved.decision || "—";
      els.decisionPercent.textContent = saved.decisionPercent || saved.confidence || "—";
      setDecisionTheme(saved.decisionTheme || saved.decision || null, false);
      els.confidence.textContent = saved.confidence || "—";
      els.warning.classList.toggle("hidden", !saved.warningVisible);
      return state.rounds.length > 0;
    } catch (error) {
      sessionStorage.removeItem(SESSION_KEY);
      console.warn("暫存資料格式錯誤，已清除", error);
      return false;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn("無法清除暫存", error);
    }
  }

  function setAnalyzing(isAnalyzing) {
    if (isAnalyzing) clearWaitingStyles();
    state.isAnalyzing = isAnalyzing;
    els.analyzeBtn.disabled = isAnalyzing;
    document.querySelectorAll("[data-result]").forEach(button => {
      button.disabled = isAnalyzing;
    });

    if (isAnalyzing) {
      els.decisionCard.className = "decision loading-theme";
      els.decision.innerHTML = '<span class="analysis-spinner" aria-label="分析載入中"></span>';
      els.decisionPercent.textContent = "—";
      els.confidence.textContent = "—";
      els.warning.classList.add("hidden");
    }
  }

  function hasValidConfig() {
    return Boolean(
      cfg.SUPABASE_URL &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_ANON_KEY.includes("請貼上")
    );
  }

  async function waitForAnalysisAuthClient(timeoutMs = 10000) {
    const startedAt = Date.now();

    while (!window.hvAnalysisAuthClient) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error("分析引擎登入驗證逾時，請重新整理頁面");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return window.hvAnalysisAuthClient;
  }

  async function waitForAnalysisAuthReady(timeoutMs = 12000) {
    const startedAt = Date.now();

    while (!document.body.classList.contains("hv-auth-ready")) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error("分析引擎登入初始化逾時，請重新整理頁面");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async function currentAnalysisAuthHeaders() {
    // 等 auth-gate 完成 SSO/session/權限驗證後才檢查資料庫，
    // 避免管理層首次登入時因初始化時序誤判成資料庫連線失敗。
    await waitForAnalysisAuthReady();
    const authClient = await waitForAnalysisAuthClient();

    const { data: { session }, error: sessionError } = await authClient.auth.getSession();
    if (sessionError || !session?.user || !session?.access_token) {
      throw new Error("登入狀態已失效，請重新登入");
    }

    const { data: allowed, error: accessError } = await authClient.rpc("hv_has_product_access", {
      p_user_id: session.user.id,
      p_product_key: "analysis_engine"
    });

    if (accessError) {
      throw new Error("無法確認分析引擎權限");
    }
    if (allowed !== true) {
      throw new Error("分析引擎權限目前未開放");
    }

    // 保留原本已驗證可用的資料庫 RPC 呼叫方式。
    // 權限是否可用已在上方透過登入者 Session 即時確認；
    // 真正的分析 RPC 繼續使用公開 key，避免既有函式的 role/grant 設定
    // 因切換成 authenticated JWT 而出現「資料庫連線或函式有誤」。
    return {
      "Content-Type": "application/json",
      "apikey": cfg.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`
    };
  }

  async function callSearchRpc(sequence) {
    if (!hasValidConfig()) {
      throw new Error("尚未填入 Supabase 公開金鑰");
    }

    const headers = await currentAnalysisAuthHeaders();

    const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/search_next_outcomes_basic`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_sequence: sequence })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`資料庫回應失敗 (${response.status})：${message}`);
    }

    return response.json();
  }

  async function testConnection() {
    if (!hasValidConfig()) {
      setDbStatus("請先填入公開金鑰", "waiting");
      return;
    }

    try {
      const headers = await currentAnalysisAuthHeaders();
      const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/search_next_outcomes_basic`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_sequence: ["測試"] })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`HTTP ${response.status}: ${message}`);
      }

      setDbStatus("資料庫已連線", "ok");
    } catch (error) {
      setDbStatus("資料庫連線失敗", "error");
      console.error(error);
    }
  }

  function createGrid() {
    els.grid.innerHTML = "";
    for (let i = 0; i < 66; i++) {
      const cell = document.createElement("div");
      cell.className = "bead-cell";
      els.grid.appendChild(cell);
    }
  }

  function renderGrid() {
    createGrid();

    state.rounds.slice(0, 66).forEach((result, index) => {
      // 珠盤路：左上開始，先往下記滿 6 格，再移到右邊下一欄。
      const row = index % 6;
      const column = Math.floor(index / 6);
      const visualIndex = row * 11 + column;

      const bead = document.createElement("span");
      bead.className = `bead ${result === "莊" ? "banker" : result === "閒" ? "player" : "tie"}`;
      bead.textContent = result;
      els.grid.children[visualIndex].appendChild(bead);
    });
  }

  function renderStats() {
    const banker = state.rounds.filter(x => x === "莊").length;
    const player = state.rounds.filter(x => x === "閒").length;
    const tie = state.rounds.filter(x => x === "和").length;
    const judged = state.correct + state.wrong;

    els.bankerTotal.textContent = banker;
    els.playerTotal.textContent = player;
    els.tieTotal.textContent = tie;
    els.totalRounds.textContent = state.rounds.length;
    els.roundCount.textContent = state.rounds.length;

    els.correct.textContent = state.correct;
    els.wrong.textContent = state.wrong;
    els.accuracy.textContent = judged
      ? `${((state.correct / judged) * 100).toFixed(1)}%`
      : "—";

    renderStreak();
  }

  function renderAll() {
    renderGrid();
    renderStats();
  }

  function renderStreak() {
    // 和局不影響連勝／連敗；只依有判定的莊／閒結果統計。
    const judged = state.evaluations.filter(x => x === "correct" || x === "wrong");

    let currentType = null;
    let currentCount = 0;
    let maxWin = 0;
    let maxLoss = 0;
    let runType = null;
    let runCount = 0;

    for (const evaluation of judged) {
      if (evaluation === runType) {
        runCount += 1;
      } else {
        runType = evaluation;
        runCount = 1;
      }

      if (runType === "correct") maxWin = Math.max(maxWin, runCount);
      if (runType === "wrong") maxLoss = Math.max(maxLoss, runCount);
    }

    if (judged.length) {
      currentType = judged[judged.length - 1];
      for (let i = judged.length - 1; i >= 0 && judged[i] === currentType; i -= 1) {
        currentCount += 1;
      }
    }

    currentCount = Math.min(66, currentCount);
    maxWin = Math.min(66, maxWin);
    maxLoss = Math.min(66, maxLoss);

    els.maxWinStreak.textContent = maxWin;
    els.maxLossStreak.textContent = maxLoss;

    if (!currentType) {
      els.streakStatus.innerHTML = "<span>目前狀態</span><strong>尚無紀錄</strong>";
      els.streakStatus.className = "streak-status neutral";
      return;
    }

    const isWin = currentType === "correct";
    els.streakStatus.innerHTML = `<span>目前狀態</span><strong>${isWin ? "連勝" : "連敗"} ${currentCount}</strong>`;
    els.streakStatus.className = `streak-status ${isWin ? "win" : "loss"}`;
  }

  function resetAnalysisDisplay() {
    showInitialWaitingState();
    els.warning.classList.add("hidden");
  }

  async function analyze(auto = false) {
    const length = Number(els.lookback.value);

    // A 基礎分析：會員目前牌靴的搜尋序列完全忽略和局。
    // 「最近 N 局」在分析時代表最近 N 個莊／閒結果。
    // 和局仍完整保留在珠盤路與牌靴統計中。
    const nonTieRounds = state.rounds.filter(result => result !== "和");
    const reverseTieCore=["reverse7","reverse8"].includes(state.strategyMethod);
    const availableRounds=reverseTieCore?state.rounds:nonTieRounds;

    if (availableRounds.length < length) {
      if (!auto) showToast(`至少需要輸入 ${length} 個莊／閒結果`);
      return;
    }

    const searchSequence = availableRounds.slice(-length);

    // RC54：一旦使用者已正式啟動分析且有效局數已足夠，
    // 「分析運作中」與「目前是否有可下注訊號」必須分開。
    // 以前只有拿到可公開方向後才設 analysisStarted=true，
    // 導致逆平第一個 D9 若為莊 / 平票 / 無候選，之後新增牌局完全不再自動重算。
    // 現在先鎖定分析已啟動，後續每一個實際 B/P/T 都會重新跑最新 D9。
    state.analysisStarted = true;
    saveSession();

    setAnalyzing(true);

    try {
      const road = await searchStrategyCore();
      const counts = road?.counts || { "莊": 0, "閒": 0 };
      const signalMass = Math.max(0,Number(counts["莊"]||0)+Number(counts["閒"]||0));
      const sampleCount = Math.max(0,Number(road?.sampleCount ?? road?.total ?? signalMass));

      if (!signalMass) {
        state.pendingPrediction = null;
        window.HawkVisionSessionPolicy?.clearPublicSignal?.();
        showNoSignalState();
        refreshSuggestedBet();
        saveSession();
        return;
      }

      let outcome = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      if (["reverse7","reverse8"].includes(state.strategyMethod) && outcome!=="閒") {
        state.pendingPrediction=null;
        window.HawkVisionSessionPolicy?.clearPublicSignal?.();
        if(els.decisionCard){
          els.decisionCard.className="decision waiting-state";
          els.decision.textContent="等待閒訊號";
          els.decisionPercent.textContent="";
          els.confidence.textContent="暫不下注";
          els.confidence.classList.add("is-waiting");
          els.warning.classList.add("hidden");
        }
        refreshSuggestedBet();saveSession();return;
      }

      // 歷史符合率：
      // 只表示「相同歷史序列中，下一個非和局結果為本次判定的比例」。
      // 它與右側信心度是兩個不同指標。
      const rawHistoricalRate = Number(counts[outcome]||0) / signalMass * 100;
      const historicalRate = Math.max(50,Math.min(100,Math.round(rawHistoricalRate)));

      // 信心度 v2.8：
      // 40% 歷史符合率 + 40% 資料充足度 + 20% 分析一致性。
      //
      // 資料充足度採平滑飽和曲線，不使用硬切門檻：
      // total 越多，分數逐步接近 100，但不會突然跳升。
      //
      // 分析一致性以莊閒差距衡量：
      // 50:50 時為 0，100:0 時為 100。
      const sampleScale = Math.max(1, Number(cfg.CONFIDENCE_SAMPLE_SCALE || 50));
      const sampleSufficiency = 100 * (1 - Math.exp(-sampleCount / sampleScale));
      const consistency = signalMass ? Math.abs(Number(counts["莊"]||0) - Number(counts["閒"]||0)) / signalMass * 100 : 0;

      const historicalWeight = Number(cfg.CONFIDENCE_HISTORY_WEIGHT || 0.40);
      const sampleWeight = Number(cfg.CONFIDENCE_SAMPLE_WEIGHT || 0.40);
      const consistencyWeight = Number(cfg.CONFIDENCE_CONSISTENCY_WEIGHT || 0.20);

      const rawConfidence =
        historicalWeight * historicalRate +
        sampleWeight * sampleSufficiency +
        consistencyWeight * consistency;

      const minConfidence = Number(cfg.MIN_CONFIDENCE_PERCENT || 30);
      const maxConfidence = Number(cfg.MAX_CONFIDENCE_PERCENT || 90);
      const confidence = Math.max(
        minConfidence,
        Math.min(maxConfidence, Math.round(rawConfidence))
      );

      // 低於 40% 才顯示警告；40% 以上不顯示。
      const lowConfidence =
        confidence < Number(cfg.LOW_CONFIDENCE_PERCENT || 40);

      // 先保存內部判定；核心停止期間仍在背景重播，但不對會員顯示方向，也不列入績效。
      state.pendingPrediction = outcome;
      const publicSignal = window.HawkVisionSessionPolicy?.isPredictionPublic?.() !== false;
      if (publicSignal) {
        showDecisionResult(outcome, `${historicalRate}%`, true);
        els.confidence.textContent = `${confidence}%`;
        els.warning.classList.toggle("hidden", !lowConfidence);
      } else {
        showCorePausedState();
      }
      refreshSuggestedBet();
      saveSession();

      if (!auto) showToast("分析完成");
    } catch (error) {
      // 正式會員畫面絕不顯示 DB / RLS / Supabase / 查詢失敗原因。
      // 技術狀態只保留在內部 console 與 core diagnostic。
      state.pendingPrediction = null;
      window.HawkVisionSessionPolicy?.clearPublicSignal?.();
      showNoSignalState();
      refreshSuggestedBet();
      saveSession();
      console.error("[HawkVision Reverse Internal]",{
        method:state.strategyMethod,
        rounds:state.rounds.length,
        historyMeta:state._reverseD9HistoryMeta||null,
        internalError:String(error?.message||error||"unknown")
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function addRound(result) {
    if (state.isAnalyzing) return;

    if (state.rounds.length >= 66) {
      showToast("珠盤路已達 66 局");
      return;
    }

    let evaluation = null;

    if (state.pendingPrediction && result !== "和") {
      // 核心停止期間的背景判斷只用於恢復條件，不列入前台正確/錯誤/連勝敗/正確率。
      const countEvaluation = window.HawkVisionSessionPolicy?.shouldCountLastResult?.() !== false;
      if (countEvaluation) {
        if (state.pendingPrediction === result) {
          state.correct += 1;
          evaluation = "correct";
        } else {
          state.wrong += 1;
          evaluation = "wrong";
        }
      }
      state.pendingPrediction = null;
    }

    state.rounds.push(result);
    state.evaluations.push(evaluation);
    renderAll();
    saveSession();

    if (state.analysisStarted && (result !== "和" || ["reverse7","reverse8"].includes(state.strategyMethod))) {
      await analyze(true);
    }
  }

  function undo() {
    if (state.isAnalyzing) return;

    if (window.HawkVisionSessionPolicy?.undoLastRound?.() === true) {
      showToast("已撤銷上一局");
      return;
    }

    if (!state.rounds.length) {
      showToast("目前沒有可撤銷的牌局");
      return;
    }

    state.rounds.pop();

    // 撤銷該局時，也同步撤銷它對正確／錯誤統計造成的影響。
    const evaluation = state.evaluations.pop();
    if (evaluation === "correct" && state.correct > 0) state.correct -= 1;
    if (evaluation === "wrong" && state.wrong > 0) state.wrong -= 1;

    state.pendingPrediction = null;
    renderAll();
    saveSession();

    const readyCount=["reverse7","reverse8"].includes(state.strategyMethod)
      ? state.rounds.length
      : state.rounds.filter(result => result !== "和").length;
    if (state.analysisStarted && readyCount >= Number(els.lookback.value)) {
      analyze(true);
    } else {
      resetAnalysisDisplay();
      saveSession();
    }
  }

  function startNewShoe() {
    // 每次開啟全新分析都重新建立一次逆平 D9 歷史快照。
    // 同一副牌靴內則固定使用這份快照，避免不同裝置/舊頁面沿用不同時間點的快取，
    // 造成 reverse7 / reverse8 在相同輸入序列下得到不同原始 D9 判定。
    state._reverseD9StructMap = null;
    state._reverseD9HistoryShoes = null;
    state._reverseD9Loading = null;
    state._reverseD9HistoryMeta = null;
    state._reverseD9LastError = null;
    state.historyIndex = null;
    state.historyLoading = null;
    try{sessionStorage.removeItem(BASIC_INDEX_CACHE_KEY)}catch(_){}

    state.rounds = [];
    state.analysisStarted = false;
    state.pendingPrediction = null;
    state.evaluations = [];
    state.correct = 0;
    state.wrong = 0;
    renderAll();
    resetAnalysisDisplay();
    clearSession();
    els.modal.classList.add("hidden");
    showToast("已開始新牌靴");
  }

  document.querySelectorAll("[data-result]").forEach(button => {
    button.addEventListener("click", () => addRound(button.dataset.result));
  });

  els.analyzeBtn.addEventListener("click", () => analyze(false));
  els.undoBtn.addEventListener("click", undo);
  els.newShoeBtn.addEventListener("click", () => els.modal.classList.remove("hidden"));
  els.cancelNewShoe.addEventListener("click", () => els.modal.classList.add("hidden"));
  els.confirmNewShoe.addEventListener("click", startNewShoe);
  els.lookback.addEventListener("change", () => {
    saveSession();
    if (state.analysisStarted) analyze(true);
  });

  window.HawkVisionAnalysisCore={
    captureExactSnapshot(){return captureExactSnapshot();},
    restoreExactSnapshot(saved){return restoreExactSnapshot(saved);},
    setStrategy(method){
      const next=method||null;
      if(state.strategyMethod!==next){
        state.strategyMethod=next;
        state.pendingPrediction=null;
      }else{
        state.strategyMethod=next;
      }
    },
    getStrategyMethod(){ return state.strategyMethod; },
    getPendingPrediction(){ return state.pendingPrediction; },
    isAnalysisRunning(){ return Boolean(state.analysisStarted); },
    getReverseD9HistoryMeta(){ return state._reverseD9HistoryMeta ? {...state._reverseD9HistoryMeta} : null; },
    getReverseD9InternalError(){ return state._reverseD9LastError||null; },
    recomputeCurrent(){ return state.analysisStarted ? analyze(true) : Promise.resolve(); },
    analyzeNow(){ return analyze(false); },
    resetEvaluationStatsPreserveShoe(){
      state.evaluations=state.rounds.map(()=>null);
      state.correct=0; state.wrong=0;
      renderAll(); saveSession();
    },
    deactivateAnalysisPreserveShoe(){
      state.analysisStarted=false;
      state.pendingPrediction=null;
      resetAnalysisDisplay();
      saveSession();
    },
    resetShoe(){ startNewShoe(); },
    setLookback(n){ const v=Math.max(1,Number(n)||6); els.lookback.value=String(v); saveSession(); },
    exportState(){return {rounds:[...state.rounds],analysisStarted:state.analysisStarted,pendingPrediction:state.pendingPrediction,evaluations:[...state.evaluations],correct:state.correct,wrong:state.wrong,lookback:els.lookback.value};},
    importState(saved){
      if(!saved||typeof saved!=="object")return false;
      state.rounds=Array.isArray(saved.rounds)?saved.rounds.filter(x=>["莊","閒","和"].includes(x)).slice(0,66):[];
      state.analysisStarted=Boolean(saved.analysisStarted);
      state.pendingPrediction=["莊","閒"].includes(saved.pendingPrediction)?saved.pendingPrediction:null;
      state.evaluations=Array.isArray(saved.evaluations)?saved.evaluations.slice(0,state.rounds.length):[];
      state.correct=Number(saved.correct||0);state.wrong=Number(saved.wrong||0);
      if(saved.lookback)els.lookback.value=String(saved.lookback);
      renderAll();resetAnalysisDisplay();saveSession();
      const readyCount=["reverse7","reverse8"].includes(state.strategyMethod)?state.rounds.length:state.rounds.filter(x=>x!=="和").length;
      if(state.analysisStarted&&readyCount>=Number(els.lookback.value))analyze(true);
      return true;
    },
    resetAnalysis(){startNewShoe();},
    getRoundCount(){return state.rounds.length;}
  };

  const restored = restoreSession();
  renderAll();
  testConnection();
  loadBasicHistoryIndex().then(()=>setDbStatus("資料庫已連線","ok")).catch(error=>{console.error("基礎路型歷史載入失敗",error);setDbStatus("分析歷史載入失敗","error")});

  // 若會員在分析已啟動後誤按 F5，恢復牌靴並重新取得最新判定。
  if (!restored || !state.analysisStarted) {
    showInitialWaitingState();
  }

  const restoredReadyCount = ["reverse7","reverse8"].includes(state.strategyMethod)
    ? state.rounds.length
    : state.rounds.filter(result => result !== "和").length;
  if (restored && state.analysisStarted && restoredReadyCount >= Number(els.lookback.value)) {
    analyze(true);
  }
})();
