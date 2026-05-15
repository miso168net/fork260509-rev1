# Specification Quality Checklist: W-F2 dockerfile-base-web

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-15
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
   - **Note**:本 feature 為 infrastructure / deploy 層 feature(W-F2 Dockerfile + nginx config);依 rev1 既有 spec 慣例(對齊 F1-F5 + W-F1)、infrastructure requirement 本身即為「使用 docker multi-stage」「nginx:1.27-alpine 為 base」「Vite build-arg env 注入」等技術配置,這些**是**需求而非實作細節。spec 不指定哪一行 dockerfile syntax、不指定 vite.config.ts 內部如何處理 process.env、不指定 nginx 內部 fastcgi / proxy module 等,落 plan 階段。對齊 W-F1 同類紀律。
- [x] Focused on user value and business needs
   - **"user" 在此 feature 為 operator / CI agent**;business value = rev1 deploy P1 第二個 image 可運行、解鎖 W-F3 compose / W-F4 secret / W-F5 front-nginx 等後續 feature 對 base-web service 引用。
- [x] Written for non-technical stakeholders
   - **Note**:同 Content Quality 第一項說明 — infrastructure feature 的 stakeholder 實際為熟悉 docker / Vue / nginx 的 operator,完全 non-technical 場景不適用。對齊 W-F1 既有風格。
- [x] All mandatory sections completed
   - User Scenarios ✓ / Requirements ✓ / Success Criteria ✓ / Assumptions ✓

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
   - grep 確認 spec.md 內 0 個 NEEDS CLARIFICATION marker;3 個 brainstorm Q&A 已在 Clarifications 段落地。
- [x] Requirements are testable and unambiguous
   - FR-001 ~ FR-028 全部 testable;每條 MUST 對應 acceptance scenario(Dimension A-E)或 docker inspect / grep / curl 可驗的具體屬性。
- [x] Success criteria are measurable
   - SC-001 ~ SC-008 含具體 metric:時間(5-10 分鐘 / < 30 sec / < 50ms)、大小(< 100MB)、比率(100% pass)、grep count(≥ 1 命中)、布林(無 blocker / SPA fallback 正確)。
- [x] Success criteria are technology-agnostic (no implementation details)
   - **Note**:同 Content Quality — SC-002 / SC-004 / SC-007 提到具體技術(image / curl / nginx / Vite),但這些**是** infrastructure feature 的 user-visible outcome、非 implementation detail。對齊 rev1 既有 spec 風格。
- [x] All acceptance scenarios are defined
   - 12 個 acceptance scenario(Dimension A 1-3 / B 4-5 / C 6-7 / D 8-10 / E 11-12)、每個 Given/When/Then 完整 3 段式。
- [x] Edge cases are identified
   - 8 個 edge case:pnpm install 慢 / Vite override 不符預期 / packages COPY 順序 / nginx user 寫入 / .env.prod mock URL 與 bundle /api 不一致 / index.html cache 誤套 / VITE_SERVICE_SUCCESS_CODE 注入 / vite build mode prod ENV override
- [x] Scope is clearly bounded
   - FR-025 ~ FR-028 明示 MUST NOT 列表、Scope summary 明示「W-F2 範圍外」清單(W-F3 ~ W-F18 + W-FA1 ~ W-FA3 全部列出);brainstorm doc 同步。
- [x] Dependencies and assumptions identified
   - Assumptions 段 12 條:base-web 無既有 Dockerfile / node:22-slim 相容 / corepack pnpm / pnpm install 跑通 / pnpm build 跑通 / Vite process.env override / VITE_SERVICE_SUCCESS_CODE 預期 / .env.prod 不動 / image size 100MB 設計目標 / linux/amd64 only / packages COPY 順序 / acceptance 不交付 compose / 兩段 commit

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
   - FR-001 ~ FR-007 → Dimension A;FR-008 ~ FR-014 → Dimension B-C(runtime + healthcheck);FR-015 ~ FR-019 → Dimension C-D(nginx config);FR-020 ~ FR-021 → 透過 build 過程隱含驗證(若 .dockerignore 漏排 / 誤排、build 直接 fail);FR-022 ~ FR-024 → image tagging convention 文件化(無 runtime acceptance、純 spec assertion);FR-025 ~ FR-028(MUST NOT 邊界保護)→ grep / file diff audit 驗證。
- [x] User scenarios cover primary flows
   - 唯一 P1 user story 涵蓋 build → run → SPA serve / healthcheck / cache 完整流程;Why this priority 段明示 5 個交付片段不可拆。
- [x] Feature meets measurable outcomes defined in Success Criteria
   - SC tied to FR + 為 W-F3 / W-F4 後續 feature 解鎖驗證(SC-008)。
- [x] No implementation details leak into specification
   - 同 Content Quality 第一項說明 — infrastructure feature 例外。

## Notes

- 本 feature 為 deploy 階段第二個 feature(W-F2)、特殊在於 deliverable 包含 3 個全新檔(Dockerfile + nginx config + .dockerignore)+ 不動既有 source code、不動 .env.prod —「無實作細節」原則須與 infrastructure feature 性質 reconcile,參考 rev1 既有 W-F1 / F1.1 / F4 紀律(infrastructure constraint 視為需求)。
- spec.md 包含 3 個 brainstorm 階段 clarification(Q1 runtime / Q2 VITE 注入 / Q3 healthcheck)、無 spec-kit `/speckit-clarify` 階段須補的 marker;**因此 user 可直接走 `/speckit-plan`(跳過 `/speckit-clarify`),或仍要走 `/speckit-clarify` 走 audit pass(空 pass)**。建議:直接 `/speckit-plan` 進入下一階段(對齊 W-F1 模式)。
- spec docs 落 outer feature branch `007-dockerfile-base-web`(已由 `before_specify` pre-hook 切換);實作落 base-web worktree `rev1-admin-base-web` 分支,兩段 commit 紀律見 CLAUDE.md §6.1。
