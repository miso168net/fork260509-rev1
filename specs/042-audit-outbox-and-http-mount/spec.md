# Feature Specification: 042 audit-outbox-and-http-mount

**Feature Branch**: `042-audit-outbox-and-http-mount`
**Created**: 2026-05-24
**Status**: Draft
**Input**: User description: "042 audit-outbox-and-http-mount (R3 + F2.2 bundle): R3 (regression 2026-05-24 撞到 HTTP middleware audit gap) + F2.2 (audit-log outbox + Redis subscriber TTL fallback) bundled，採 Pattern A unified outbox-first 架構（新 sys_audit_outbox 表 + drainer + Redis stream）。軌道外 rust-only + spec md。詳見 docs/superpowers/042-feature-audit-outbox-and-http-mount.md brainstorm 文件"

**前置文件**：[`docs/superpowers/042-feature-audit-outbox-and-http-mount.md`](../../docs/superpowers/042-feature-audit-outbox-and-http-mount.md)（brainstorm 設計、3 Q 拍板 + 設計三節已 approved）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Forensic 操作員拿到完整 audit trail，每筆 admin write 都有 2 視角且 0 遺漏 (Priority: P1) 🎯 MVP

forensic / 維護操作員（人類或自動工具）在事後調查任何 admin write 操作（如「誰在何時更新了 role X 的權限？」）時，可以查詢 audit log 並看到**雙視角**：一筆 service-level「業務內部視角」（INTERNAL，含完整 entity snapshot）+ 一筆 HTTP-level「網路請求視角」（含 method / URL / IP / user-agent / request body / response body）。即使 Redis 或主 audit 儲存暫時不可用，audit 事件**不會遺失**——系統保留事件於耐久暫存區、等服務恢復後自動補完。

**Why this priority**：spec 003 F2.1 已要求「每 write 2 row」、但 HTTP middleware layer 從未 mount 導致 HTTP 視角永遠 0 row、forensic 操作員只能看半套真相；此 P1 直接補完此承諾，是本 feature 的核心交付。0-loss 保證使 audit log 可被 compliance / 法規場景倚賴。

**Independent Test**：dev stack 健康狀態下、發起任意 admin POST/PUT/PATCH/DELETE 請求（如 `POST /api/role`），等不超過 1 秒後查詢 audit log——應看到 2 筆 row（一筆 service-level、一筆 HTTP-level），兩筆都標相同 entity_type、相同 actor、可由共同 request_id 串聯。

**Acceptance Scenarios**：

1. **Given** dev stack 健康、admin 持有效 token；**When** 發起 `POST /api/role` 建立新 role；**Then** 1 秒內查 audit log、看到 2 筆 row：一筆 method=INTERNAL（payload_after 含 role snapshot）+ 一筆 method=POST（含 URL / IP / user-agent），entity_type 皆為 `sys_role`、actor 皆為當前 admin。
2. **Given** Redis 暫時離線（停 redis container）；**When** admin 發起任何 admin write；**Then** request 成功回 200、audit 事件被保留於耐久暫存區、Redis 恢復後背景處理機制自動消化暫存事件 → audit log 出現對應 row、且 Redis stream 也補上事件。
3. **Given** 主 audit log 儲存暫時寫入失敗（mock DB error）；**When** 背景處理機制嘗試寫入；**Then** 該事件在暫存區留 retry_count 計次、不丟、達到上限後標 dead-letter 留待人工檢視（其他事件不受影響）。
4. **Given** rust-api 水平擴展跑 2 個 replica；**When** 同時間有 100 個 admin write 事件落暫存區；**Then** 每筆事件僅被處理一次（無重複 row）、總計 sys_operation_log 200 row（每事件 2 row）、Redis stream 200 entry。

---

### User Story 2 — 外部 subscriber 從 Redis stream 即時取 audit 事件、落後時 fallback 從 DB 補 (Priority: P2)

外部觀測系統（SIEM / analytics / alerting / 即時 dashboard）需要近即時取得每筆 admin write audit 事件以執行行為偵測、合規告警、跨系統關聯分析。subscriber 從 Redis 增量 stream 取最新事件；若 subscriber 因網路或自身故障落後超過 retention window、必須能從主 audit log 查詢補資料、再切回 stream。

**Why this priority**：本 feature 落地後 audit 事件成為 first-class event source、解鎖 observability / SIEM 整合；但「實際 subscriber 實作」屬下游需求（W-F12/13/14 observability）。本 user story 提供 stream interface + 落後 fallback 契約、subscriber 端的對接由其他 feature 接手。

**Independent Test**：發起 admin write 後、用 Redis client 對 stream 跑增量讀取（XREAD）取最新事件、解析 JSON、確認欄位完整（actor / operation / entity_type / source / payload）。落後測試：清空 stream 末端再跑 admin write、subscriber 偵測 gap、改由查詢主 audit log 補上 missing 範圍 row。

**Acceptance Scenarios**：

1. **Given** dev stack 健康、Redis 可達；**When** admin 發起 `POST /api/role`；**Then** 1 秒內 Redis stream `audit:events` 多 2 entry（INTERNAL + HTTP）、每 entry JSON 含 actor / operation / entity_type / entity_id / payload_before / payload_after / source（HTTP 含 method/URL/IP）。
2. **Given** stream 已積 10000 entry 達 retention 上限；**When** 又有新 audit 事件 push；**Then** Redis 自動 trim 最舊 entry、新 entry 落入；XLEN 仍約 ≤ 10000。
3. **Given** subscriber 落後超過 retention window、XREAD 拿到的 first id > 預期 next id；**When** subscriber 偵測 gap；**Then** subscriber 改查 audit log 取 (last_known_id, current_first_in_stream] 範圍 row、補完後切回 stream 增量讀取。
4. **Given** Redis 部署為 cluster 模式；**When** publish 操作；**Then** stream publish 透過 single-key hash slot 正常工作（不像 pub/sub 般受 cluster 限制）。

---

### User Story 3 — 失敗登入也產 HTTP audit row（R2 自動結案）(Priority: P3)

當 user 用錯密碼嘗試 `POST /auth/login`、目前 audit 路徑只在登入成功時寫 row（service-level audit 走 success path）；本 feature 讓 HTTP middleware 涵蓋所有 endpoint、失敗登入也產 HTTP-source audit row、安全事件不再有 blind spot。R2（regression 2026-05-24 / F003 C-V8）自動結案。

**Why this priority**：R2 是 known follow-up（自 F14 cutover 留下）；本 feature 副產品式覆蓋、無需另開 feature。P3 因為 R2 本身不 block 其他工作。

**Independent Test**：發起 `POST /auth/login` 用錯密碼、查 audit log 應有 1 row method=POST、URL=/auth/login、payload_after 含 401 envelope。

**Acceptance Scenarios**：

1. **Given** user 不存在或密碼錯；**When** `POST /auth/login` 帶錯誤憑證；**Then** 回 envelope `code=1003`、audit log 多 1 row method=POST、url=/auth/login、status_code 對應失敗、user_id 留空（無 authenticated user）但 ip / user_agent 完整。
2. **Given** user 用正確憑證；**When** `POST /auth/login`；**Then** audit log 有 2 row：HTTP-source（method=POST）+ INTERNAL（method=INTERNAL）；既有 `auth_login_listener` 行為不受影響。

---

### Edge Cases

- **HTTP audit 寫暫存區失敗（middleware 階段）**：post-execution hook、業務已 commit、無法 rollback；middleware audit 寫入失敗 → log warn + 不影響 response（per spec 003 §13 Edge Case 既有紀律）。HTTP 視角 row 缺失於 log warn 中標記、但業務正確性 + INTERNAL 視角不受影響。
- **背景處理機制 process 整體 down**：暫存區事件累積（published 狀態保持 unpublished）、不丟資料；process 重啟後從最舊 unpublished 繼續消化。
- **暫存區事件達到 retry 上限**：標 dead-letter（保留 row 不再嘗試）、發 tracing::error；運維可手動清或修復根因後重置 retry_count。
- **多 replica 同時處理同一事件**：暫存區 SELECT 機制保證同 row 只被一個處理者取得（row-level skip-locked）；無需 leader election、無重複處理。
- **Redis Cluster 模式**：stream publish 對 single key 工作（不像 pub/sub 般 cluster 不支援）；若 cluster 配置不支援 stream、graceful skip（沿用 casbin_notify.rs 體例）、退化為 DB-only audit、業務功能不受影響。
- **既有 sys_operation_log 歷史 row**：F2.1 落地以來累積的 row 不動、不 migrate；reader 過濾 `created_at >= <042 落地時間>` 看新格式 audit。
- **GET / HEAD / OPTIONS / TRACE 等 read path**：per spec 003 FR-015 + Constitution §II、不寫 audit row（既有紀律保留）。HTTP middleware 只對 write method（POST / PUT / PATCH / DELETE）寫 audit。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：系統 MUST 對每一筆 admin write 操作（POST / PUT / PATCH / DELETE）寫 2 筆 audit row 至主 audit log：一筆 service-level 視角（標 INTERNAL、含完整 entity snapshot）、一筆 HTTP-level 視角（含 method / URL / IP / user-agent / request body / response body）。
- **FR-002**：系統 MUST 提供耐久暫存區（durable staging area）緩衝 audit 事件、保證 Redis 或主 audit log 暫時不可用時 audit 事件不會遺失；恢復後背景處理機制自動消化暫存事件至主 audit log + Redis stream。
- **FR-003**：HTTP middleware audit 路徑 MUST 涵蓋所有現有 admin / auth / authorization router（不分 nested mount path、不分 endpoint method）、確保任何 write 都會產 HTTP 視角 row。
- **FR-004**：URL → entity_type 對應規則 MUST 涵蓋當前實際 router mount path（`/api/user`、`/api/role`、`/api/route` 等、無 sys- 前綴）+ `/api/systemManage/<alias>` 全 alias endpoint（映射至對應 sys_* entity）；無 match 則 fallback `http_event` sentinel（per spec 003 Clarifications Q2 hybrid rule、本 feature 修正既有 stale 規則）。
- **FR-005**：系統 MUST 在 Redis 提供 audit 事件 stream（Redis Streams 結構、不用 pub/sub）、subscribers 可增量取最新事件；stream MUST 配 retention window（approximate 上限 ~10000 entry、Redis 自動 trim 最舊）。
- **FR-006**：subscriber 偵測 stream 落後（gap）時 MUST 有 fallback 路徑可從主 audit log 查詢補完範圍；契約定義：subscriber 對比 stream first id 與自身 last_known_id、若 first id > last_known_id + 1 即偵測為 gap、走 fallback。
- **FR-007**：HTTP middleware audit 寫入 MUST 為 fire-and-forget 模式、不阻塞 response return（response latency contribution ≤ 1ms）。
- **FR-008**：HTTP middleware audit 寫入失敗 MUST 走 log warn + 不影響 response status / body（per spec 003 §13 Edge Case 既有紀律）。
- **FR-009**：service-level INTERNAL audit 路徑 MUST 與業務變動同一 transaction commit / rollback（既有 spec 003 §13.1 紀律保留、不退化）。030–040 features 全 callsite 0 改動（API 不變）。
- **FR-010**：背景處理機制 MUST 在多 replica 部署下安全運作（rust-api 水平擴展 W-F11 場景）、同一暫存事件不會被多 replica 重複處理。
- **FR-011**：背景處理機制 MUST 對暫存事件實作 retry 邏輯（固定間隔即可、不要求 exponential）、達到上限後標 dead-letter（不再嘗試、留待人工檢視）。
- **FR-012**：本 feature 0 base-web 改動、0 nestjs（已退場、F14）、0 新 cargo crate dep（最多 +0、Redis / tokio / sea-orm 既有）。
- **FR-013**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up 移除 R3 + R2 兩 row（R2 由 FR-003 自動覆蓋）、規劃中 follow-up 移除 F2.2、已完成里程碑加 042 entry。
- **FR-014**：背景處理機制 batch_size、sleep_interval、max_retry MUST 為可配置（從應用 config 讀、env override）、避免硬編。

### Key Entities

- **Audit Event**：對單一 admin write 操作的可追溯紀錄、含 actor（誰）、operation（INSERT / UPDATE / SOFT_DELETE / HARD_DELETE）、entity_type（如 sys_user / sys_role）、entity_id、payload_before（變動前 snapshot）、payload_after（變動後 snapshot）、source（INTERNAL service 視角 / HTTP middleware 視角）、request_id（跨 row 串聯共同 request 的兩視角）。每一筆 admin write 產生兩個 audit event（INTERNAL + HTTP）。
- **Audit Outbox Row**：耐久暫存區單一 row、含 audit event 完整 payload（JSONB）、處理狀態（pending / published / dead-letter）、retry 計次、最後錯誤訊息（debug 用）。事件先落 outbox 才被背景處理機制消化。
- **Audit Stream Entry**：Redis stream 內單一事件、由背景處理機制 publish；含完整 audit event payload（與 audit log row 同 schema）、stream 內以 id 排序、配 retention window 上限自動 trim。
- **Subscriber**：外部消費者（SIEM / analytics / 觀測系統）、不在本 feature 實作範圍、本 feature 只定義 stream interface + fallback 契約；subscriber 維護自身 last_known_id 對應 stream 進度。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：admin 對任一 write endpoint 發起請求後、1 秒內主 audit log 有 2 筆對應 row（INTERNAL + HTTP）；100 次連續 write 場景下、200 row 全到、0 遺漏（per US1 Acceptance Scenario 1）。
- **SC-002**：Redis 暫停 1 分鐘期間發起 50 個 admin write、Redis 恢復後 60 秒內 stream 補齊全 100 個對應 entry（50 INTERNAL + 50 HTTP）、主 audit log 也補齊（per US1 Acceptance Scenario 2、FR-002）。
- **SC-003**：rust-api scale 2 replica、同時發起 100 個 admin write、無重複 audit row（200 row、不是 400）（per US1 Acceptance Scenario 4、FR-010）。
- **SC-004**：HTTP middleware mount 後、單次 `POST /api/role` request 平均 latency 與 mount 前相比增加 ≤ 1ms（FR-007）。
- **SC-005**：subscriber 從 Redis stream 取得最新事件的延遲（從事件 publish 到 subscriber 收到）中位數 ≤ 100ms、p95 ≤ 500ms（dev stack 環境）。
- **SC-006**：subscriber 落後超過 retention window 後、fallback 從主 audit log 查詢能補完全部 missing 範圍 row（per US2 Acceptance Scenario 3、FR-006）。
- **SC-007**：失敗登入 `POST /auth/login` 後、主 audit log 有 1 筆 method=POST、url=/auth/login、user_id 為空、ip/user_agent 完整的 row（per US3 Acceptance Scenario 1、R2 自動結案驗證）。
- **SC-008**：URL → entity_type 規則涵蓋所有現有 admin write endpoint：抽樣驗證 `/api/user`→`sys_user`、`/api/role`→`sys_role`、`/api/route`→`sys_menu`、`/api/systemManage/addUser`→`sys_user`、`/auth/login`→`http_event` 等代表性 endpoint 對應正確。
- **SC-009**：本 feature 完成後 0 base-web 改動、0 schema migration（除新 sys_audit_outbox 表）、0 新 cargo crate dep。
- **SC-010**：本 feature 完成後 INTEGRATION-CHECKLIST 衍生 follow-up 移除 R3 + R2、規劃中 follow-up 移除 F2.2、已完成里程碑加 042 entry。
- **SC-011**：spec 003 既有 Acceptance Scenario 5（HTTP middleware audit row）+ C8（每 write 2 row）自動轉綠、無需獨立 spec hygiene-pass。

## Assumptions

- dev stack 健康（5 service：postgres / redis / rust-api / front-nginx / base-web、見 [`CLAUDE.md §8.2`](../../CLAUDE.md)）；本 feature 不擴 service。
- 預設帳號可登入（`Soybean`/`123456` 等、per [`CLAUDE.md §8.1`](../../CLAUDE.md)），admin write 驗證用 Soybean、失敗登入驗證用任意錯誤憑證。
- Redis 既有部署為 standalone（dev stack）、生產可能 cluster；本 feature 對 cluster 模式 graceful skip（per Edge Case、不阻塞落地）。
- W-F11 rust-api 水平擴展為既有設計（per [`specs/026-rust-horizontal-scaling/`](../../specs/026-rust-horizontal-scaling/)）、本 feature 在此基礎上設計 drainer multi-replica safety。
- 030–040 features 的既有 service-level audit callsite 透過 `audit_log::write_in_txn` helper；本 feature 改 helper 內部目標但保 API 不變、callsite 0 改動。
- 既有 sys_operation_log 歷史 row 不 migrate（per Edge Case）；reader 過濾時間區分新舊格式。
- subscriber 實作不在本 feature 範圍、本 feature 只交付 publisher 端 + stream interface + fallback 契約。實際 subscriber 由 W-F12/13/14 observability feature 或外掛系統實作。
- HTTP audit 失敗 acceptable：per spec 003 §13 Edge Case 紀律、middleware 寫 audit 失敗只 log warn 不影響 response；本 feature 沿用此紀律、不擴張至「audit 必成」契約。
- F12 cleanup-job HARD_DELETE audit 已實作（per `specs/027-cleanup-job/`）、本 feature 不重複定義；不在本 feature 範圍。
- /auth/logout 端點未實作（per R5）、不在本 feature 涵蓋（HTTP middleware mount 後若該端點存在自然會被 audit、但端點本身的補實作為 R5 follow-up scope）。
- 既有 1 處 per-route `OperationLogLayer::new(true)` mount（`sys_menu_route.rs:16` 的 `/getConstantRoutes` 端點）將被本 feature 移除（apply_layers 統一 mount 後變冗餘）；該端點為 unauthenticated read、原 mount 行為實際無寫 audit 影響。
