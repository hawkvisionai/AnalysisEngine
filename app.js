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
    wrong: 0
  };

  const $ = id => document.getElementById(id);
  const els = {
    grid: $("beadGrid"), dbStatus: $("dbStatus"), lookback: $("lookback"),
    analyzeBtn: $("analyzeBtn"), undoBtn: $("undoBtn"), newShoeBtn: $("newShoeBtn"),
    roundCount: $("roundCount"), decision: $("decisionValue"), confidence: $("confidenceValue"),
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

    const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/search_next_outcomes`, {
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
      const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/search_next_outcomes`, {
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
    els.decision.textContent = "—";
    els.confidence.textContent = "—";
    els.warning.classList.add("hidden");
  }

  async function analyze(auto = false) {
    const length = Number(els.lookback.value);
    if (state.rounds.length < length) {
      if (!auto) showToast(`至少需要輸入 ${length} 局`);
      return;
    }

    const sequence = state.rounds.slice(-length);
    els.analyzeBtn.disabled = true;

    try {
      const rows = await callSearchRpc(sequence);
      const counts = { "莊": 0, "閒": 0, "和": 0 };

      for (const row of rows) {
        if (row.outcome in counts) {
          counts[row.outcome] = Number(row.match_count || 0);
        }
      }

      const total = counts["莊"] + counts["閒"] + counts["和"];
      if (!total) {
        els.decision.textContent = "—";
        els.confidence.textContent = "—";
        // 會員端不顯示「找不到相同歷史序列」或任何歷史樣本資訊。
        els.warning.classList.add("hidden");
        state.pendingPrediction = null;
        return;
      }

      const outcome = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

      // 最終信心度：
      // 1. 先計算歷史結果中最高比例。
      // 2. 內部依資料充足程度向下調整，但不向會員顯示樣本數。
      // 3. 會員端顯示範圍固定為 30%～90%。
      const rawConfidence = (counts[outcome] / total) * 100;
      const minMatches = Number(cfg.MIN_MATCHES || 10);
      const sampleFactor = Math.min(1, total / minMatches);
      const minConfidence = Number(cfg.MIN_CONFIDENCE_PERCENT || 30);
      const maxConfidence = Number(cfg.MAX_CONFIDENCE_PERCENT || 90);
      const adjustedConfidence = Math.round(rawConfidence * sampleFactor);
      const confidence = Math.max(
        minConfidence,
        Math.min(maxConfidence, adjustedConfidence)
      );
      // 低於 40% 才顯示警告；40% 以上不顯示。
      const lowConfidence =
        confidence < Number(cfg.LOW_CONFIDENCE_PERCENT || 40);

      els.decision.textContent = outcome;
      els.confidence.textContent = `${confidence}%`;
      els.warning.classList.toggle("hidden", !lowConfidence);
      state.pendingPrediction = outcome;
      state.analysisStarted = true;

      if (!auto) showToast("分析完成");
    } catch (error) {
      // 會員端不顯示技術錯誤或歷史搜尋細節。
      els.decision.textContent = "—";
      els.confidence.textContent = "—";
      els.warning.classList.add("hidden");
      setDbStatus("資料庫連線或函式有誤", "error");
      showToast("分析暫時無法使用");
      console.error(error);
    } finally {
      els.analyzeBtn.disabled = false;
    }
  }

  async function addRound(result) {
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

    if (state.analysisStarted) {
      await analyze(true);
    }
  }

  function undo() {
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

    if (state.analysisStarted && state.rounds.length >= Number(els.lookback.value)) {
      analyze(true);
    } else {
      resetAnalysisDisplay();
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
    if (state.analysisStarted) analyze(true);
  });
  els.advancedMode.addEventListener("click", () => {
    showToast("B 完整牌局將由管理員權限控制，測試版尚未開放");
  });

  renderAll();
  testConnection();
})();
