# graphify 知識圖譜 — 現況與限制

> CLAUDE.md §3 的詳細補充：圖譜統計、抽取機制限制（caveats）的權威清單。
> 主要操作方式列在 CLAUDE.md §3；本文是「**推論前必讀**」的細節。

---

## 現況

圖譜已建好（**4,216 nodes / 4,195 edges / 1,228 communities**，跨 4 個 fork + rev1 base/rust 源倉 — 起源於 fork260509 抄入、2026-05-12 完成路徑遷移與 incremental update，可作 rev1 設計參考）。

---

## 已知圖譜限制（推論前要記得）

- **NestJS DI 結構在圖中是破碎的**：AST extractor 看不懂 `@Module({ imports, providers })` decorator 也沒解 ES6 `import`。22 個 NestJS module + ~1900 個 .ts file-level node 是孤立的（數字採自 fork260509 那次抓圖，rev1 update 後可能微異）。問 NestJS 部分時要直接讀檔，別只信圖。
- **Vue component composition 也破碎**：182 個 `.vue` 元件孤立（`<template>` 標籤對應到 import 元件的關係沒被抓；數字同樣是 fork260509 抓的）。
- **Rust 部分圖譜大方向可信**：god nodes / cohesion / bridges 站得住腳。但具體 call edges 要校驗 — 詳見下三條 Rust 專屬 caveat。
- **PNG 流程圖（如 router-guard-flow.png）擷取準確 ~94%**，但**沒連到實作**：33 個流程節點與 `router/guard/route.ts` 的 4 個函式之間 0 邊。
- **`get_db_connection()` 的 48 條 INFERRED edge 方向是反的**（實際是 caller→callee，圖譜寫成 callee→caller）。
- **Rust macro-expanded calls 抓不到**：AST extractor 不展開 macro，semantic LLM 也識別不出 macro 內的隱式依賴。實測 `server/initialize/src/router_initialization.rs` 內 `merge_router!` macro 展開的 12 個 `SysXxxRouter::init_xxx_router()` calls 全部漏邊（initialize_admin_router 只抓到 16/28+ 條真實 edges）。對涉及大量 macro 的 Rust「集成檔」要回頭讀 source 補完 call graph。
- **Rust trait method dispatch 完全抓不到**：dynamic dispatch（如 `validator.validate_key()`、`validator.validate_signature()`，validator 為 trait object）AST 不抓、semantic LLM 也常漏。實測 `validate_request()` 內 2 個 trait method call + 3 個 `SystemEvent::*` / `Box::new(...)` constructor 全部漏邊。Rust trait-heavy 程式（service trait、validator trait、event payload trait）的 call graph 需手動補。
- **AST EXTRACTED 邊方向不全可信**：原本以為 AST 抓的 EXTRACTED 邊 100% 正確，但實測**同 file 內 fn 互調**可能方向反。例：`validate_request → api_key_middleware` 標 EXTRACTED，實際是 `api_key_middleware` (L126) calls `validate_request`。引用 EXTRACTED 邊前若涉及同 file fn 互調，仍要掃一眼 source 確認。
- **`initialize_admin_router()` 的 `→ main()` INFERRED edge 方向反**：實際是 `main()` calls `initialize_admin_router()`。同類問題在 Rust LLM 推測邊偶見，引用 INFERRED edges 前最好掃一眼 source 確認方向。
- **Community label 在重跑 cluster 後可能失準**：本次 update（2026-05-12）採用「對新 cluster 用 majority 投票繼承舊 labels」策略，但新增 600 nodes 後社群結構重組，部分繼承 label 不再準確。實測 community 7 標 "Database Migrations" 但實際含 `.ok()`(NestJS) / `.create_access_key()` / casbin middleware `.call()` 等混雜內容。引用 `graphify query` 返回的 Suggested Questions 時，「bridge to <community label>」要回頭核對社群實際 membership，**不要把 label 當社群純度的保證**。
- **graphify 對同質條目可能標籤不一致**：同一文件內並列的同類條目（如 README「## 版本」段列出的 4 個 variant），LLM 抽取時可能用不同 relation / confidence 標籤。實測 `SoybeanAdmin project (concept)` 對 4 個 variants 的標籤：`legacy` 標 `references` + EXTRACTED；`AntDesignVue` / `ElementPlus` 卻標 `semantically_similar_to` + INFERRED。內容都是真實的，但 confidence 被 LLM 低估。引用 INFERRED semantic-similarity 邊時，若同段文字內有 EXTRACTED `references` 的同類兄弟，多半 INFERRED 那條內容也屬實，只是 confidence 標籤偏差。
- **Suggested Questions 「weakly-connected = doc gap」是假信號**：`GRAPH_REPORT.md` Suggested Questions 演算法看到 weakly-connected nodes 時會推斷「documentation gap / missing edges」，但這假設對 graphify 自己抓不到的 ecosystem 不成立（NestJS DI / Vue component composition / Rust macro / Rust trait dispatch — 都會生成假 weakly-connected）。實測 Q6：3 個 NestJS 大模組 (`AppModule` / `BaseDemoModule` / `ApiModule`) graphify 抓到 degree=1（只有 file→fn contains），但 `app.module.ts` 真實 source 內 `AppModule` 至少 imports 7+、controllers 1、providers 4+ — 完全是 graphify 局限不是 doc gap。看到「weakly-connected nodes found」建議先核對該 ecosystem 是否在上述 graphify 盲點清單內。同理：community cohesion score 低（< 0.1）對 graphify 盲點 ecosystem 也是假信號，**不該據此判斷「該不該拆 module」**。

> rev1 的 base-web 來源是 `example` 分支（不是 `main`），與 fork260509 的圖譜抓取點不完全一致。具體 file structure 上的 GAP 分析需要對 rev1 的 worktree 重做。
