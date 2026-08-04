// Supabase（資料庫服務）設定
// Project URL 已依照你提供的畫面填入。
// 請把下方 SUPABASE_ANON_KEY 換成 Supabase 的 Publishable key（公開金鑰）或 anon public key。
// 不要使用 service_role key（管理員祕密金鑰）。

window.HAWKVISION_CONFIG = {
  SUPABASE_URL: "https://rwxujvpakpemiwkitltk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eHVqdnBha3BlbWl3a2l0bHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjIwNTEsImV4cCI6MjEwMDczODA1MX0.Acmn_T2Dfi6j5-_xTdYgjEwBN7t0YYNv1RRiHgmKhSE",

  // 內部參考資料達 10 次時，才視為完整資料量。
  // 會員端不會看到歷史樣本數。
  MIN_MATCHES: 10,

  // 最終信心度低於 40% 時顯示「信心度過低，不建議下注」。
  // 40% 以上不顯示警告。
  LOW_CONFIDENCE_PERCENT: 40,

  // 會員端信心度最低顯示 30%，最高顯示 90%。
  MIN_CONFIDENCE_PERCENT: 30,
  MAX_CONFIDENCE_PERCENT: 90,

  // v2.8 信心引擎權重。
  // 左側「本次判定 %」不受這些權重影響，只顯示歷史符合率。
  CONFIDENCE_HISTORY_WEIGHT: 0.40,
  CONFIDENCE_SAMPLE_WEIGHT: 0.40,
  CONFIDENCE_CONSISTENCY_WEIGHT: 0.20,

  // 資料充足度的平滑尺度；數字越大，信心度隨資料量上升得越慢。
  // 會員端不會看到歷史樣本數。
  CONFIDENCE_SAMPLE_SCALE: 50
};
