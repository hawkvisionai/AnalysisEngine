# HawkVision Analysis Engine v3.0 Preview 6

GitHub Pages 覆蓋更新版。

## 本版修正
- 修正電腦版 Logo 飛行終點與 Header 最終位置未完全重疊。
- 原因是開場期間隱藏垂直捲軸，結束後捲軸出現，頁面中心位置會橫向移動。
- 現在會先恢復最終捲軸狀態，等待瀏覽器完成兩次版面重排，再取得 Header Logo 座標。
- 加入穩定捲軸預留空間，避免桌機畫面寬度於轉場前後改變。
- 手機版、清晰 Favicon、等待畫面及既有分析功能全部保留。
