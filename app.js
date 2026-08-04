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
    isAnalyzing: false
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
    els.decision.textContent = outcome || "—";
    els.decisionPercent.textContent = percentText || "—";
    setDecisionTheme(outcome, flash);
  }

  function clearDecisionResult() {
    els.decision.textContent = "—";
    els.decisionPercent.textContent = "—";
    setDecisionTheme(null, false);
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

  async function callSearchRpc(sequence) {
    if (!hasValidConfig()) {
      throw new Error("尚未填入 Supabase 公開金鑰");
    }

    const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/search_next_outcomes_basic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`
      },
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
      const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/search_next_outcomes_basic`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": cfg.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`
        },
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
    clearDecisionResult();
    els.confidence.textContent = "—";
    els.warning.classList.add("hidden");
  }

  async function analyze(auto = false) {
    const length = Number(els.lookback.value);

    // A 基礎分析：會員目前牌靴的搜尋序列完全忽略和局。
    // 「最近 N 局」在分析時代表最近 N 個莊／閒結果。
    // 和局仍完整保留在珠盤路與牌靴統計中。
    const nonTieRounds = state.rounds.filter(result => result !== "和");

    if (nonTieRounds.length < length) {
      if (!auto) showToast(`至少需要輸入 ${length} 個莊／閒結果`);
      return;
    }

    const searchSequence = nonTieRounds.slice(-length);
    setAnalyzing(true);

    try {
      const rows = await callSearchRpc(searchSequence);
      const counts = { "莊": 0, "閒": 0 };
      let total = 0;

      for (const row of rows) {
        if (row.outcome in counts) {
          counts[row.outcome] = Number(row.match_count || 0);
        }
      }

      total = counts["莊"] + counts["閒"];

      if (!total) {
        clearDecisionResult();
        els.confidence.textContent = "—";
        // 會員端不顯示「找不到相同歷史序列」或任何歷史樣本資訊。
        els.warning.classList.add("hidden");
        state.pendingPrediction = null;
        saveSession();
        return;
      }

      const outcome = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

      // 歷史符合率：
      // 只表示「相同歷史序列中，下一個非和局結果為本次判定的比例」。
      // 它與右側信心度是兩個不同指標。
      const historicalRate = Math.round((counts[outcome] / total) * 100);

      // 信心度 v2.8：
      // 40% 歷史符合率 + 40% 資料充足度 + 20% 分析一致性。
      //
      // 資料充足度採平滑飽和曲線，不使用硬切門檻：
      // total 越多，分數逐步接近 100，但不會突然跳升。
      //
      // 分析一致性以莊閒差距衡量：
      // 50:50 時為 0，100:0 時為 100。
      const sampleScale = Math.max(1, Number(cfg.CONFIDENCE_SAMPLE_SCALE || 50));
      const sampleSufficiency = 100 * (1 - Math.exp(-total / sampleScale));
      const consistency = Math.abs(counts["莊"] - counts["閒"]) / total * 100;

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

      // 左側：歷史符合率。右側：HawkVision 綜合信心度。
      showDecisionResult(outcome, `${historicalRate}%`, true);
      els.confidence.textContent = `${confidence}%`;
      els.warning.classList.toggle("hidden", !lowConfidence);
      state.pendingPrediction = outcome;
      state.analysisStarted = true;
      saveSession();

      if (!auto) showToast("分析完成");
    } catch (error) {
      // 會員端不顯示技術錯誤或歷史搜尋細節。
      clearDecisionResult();
      els.confidence.textContent = "—";
      els.warning.classList.add("hidden");
      setDbStatus("資料庫連線或函式有誤", "error");
      showToast("分析暫時無法使用");
      saveSession();
      console.error(error);
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

    if (state.pendingPrediction) {
      // 和局屬於中性結果：不計正確，也不計錯誤。
      // 莊／閒結果才用來驗證上一局預測。
      if (result !== "和") {
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

    if (state.analysisStarted) {
      await analyze(true);
    }
  }

  function undo() {
    if (state.isAnalyzing) return;

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

    const nonTieCount = state.rounds.filter(result => result !== "和").length;
    if (state.analysisStarted && nonTieCount >= Number(els.lookback.value)) {
      analyze(true);
    } else {
      resetAnalysisDisplay();
      saveSession();
    }
  }

  function startNewShoe() {
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
  els.advancedMode.addEventListener("click", () => {
    showToast("B 完整牌局將由管理員權限控制，測試版尚未開放");
  });

  const restored = restoreSession();
  renderAll();
  testConnection();

  // 若會員在分析已啟動後誤按 F5，恢復牌靴並重新取得最新判定。
  const restoredNonTieCount = state.rounds.filter(result => result !== "和").length;
  if (restored && state.analysisStarted && restoredNonTieCount >= Number(els.lookback.value)) {
    analyze(true);
  }
})();
