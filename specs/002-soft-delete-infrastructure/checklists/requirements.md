# Specification Quality Checklist: F3 — soft-delete-infrastructure

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - 偏離理由：F3 是 rust-api 內部基礎建設、與 F4 一樣 spec 內含具體模組路徑 + Rust trait 名（如 `server_core::db::soft_delete::SoftDeletable`、`server_model::admin::facade::sys_<entity>`）— 此為本 workspace spec 既定風格（沿 F4 pattern），實作細節集中在 plan / data-model；spec 仍 focus 在「為何要這個 API surface」與「acceptance scenarios」
- [x] Focused on user value and business needs（admin 操作軟刪 + audit 紀錄 + auth gate 掩蔽軟刪 row）
- [x] Written for non-technical stakeholders (within bounds of being an internal infrastructure feature)
- [x] All mandatory sections completed（User Scenarios / Requirements / Success Criteria / Assumptions）

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain（brainstorming 已 6 個關鍵問題拍板完）
- [x] Requirements are testable and unambiguous（25 條 FR 全可由 grep + cargo check + acceptance test 驗）
- [x] Success criteria are measurable（8 條 SC 全部含具體驗證指令或 test case 引用）
- [x] Success criteria are technology-agnostic（同 Content Quality 偏離理由：與 F4 pattern 一致、實作具體性可接受；SC 仍可由 file/grep/test 客觀量度）
- [x] All acceptance scenarios are defined（10 個 scenarios 分 3 個 dimensions）
- [x] Edge cases are identified（9 條 edge cases 涵蓋 TIMESTAMP / built_in / migration 順序 / 空表 / ActiveModel.delete / cleanup job / LEFT JOIN / 重複軟刪 / 並發）
- [x] Scope is clearly bounded（FR-023/-024/-025 明示「不包含」項目 + Scope summary）
- [x] Dependencies and assumptions identified（11 條 Assumption 涵蓋 sys_operation_log_service / F2 接口 / built_in 防護 / Casbin orphan / F4 envelope code 等）

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria（FR ↔ Scenario ↔ SC 三層映射、見下表）
- [x] User scenarios cover primary flows（軟刪 + 還原 + auth gate 掩蔽 + partial unique 三大主流）
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification（同 Content Quality 偏離理由）

## FR ↔ Scenario ↔ SC 映射 (sanity check)

| FR 群 | 對應 Scenario | 對應 SC |
|---|---|---|
| FR-001..006 (DB schema) | A1 / A2 / A3 | SC-001 / SC-002 |
| FR-007..012 (trait + facade、FR-013 已移除) | B4 / B5 / B6 / B7 | SC-003 / SC-004 / SC-006 |
| FR-014..016 (service migration) | B6 / B7（以 facade 呼叫） | SC-008 |
| FR-017..019 (CI lint) | C8 | SC-005 |
| FR-020..022 (audit) | B6 / B7（內含 audit 寫入驗證） | SC-006 |
| FR-023..025 (邊界) | C9 / C10（join row 不動） | （隱含）|
| FR-026..027 (樹狀 entity cascade、per Clarifications Q1) | D11 / D12 | SC-009 |
| FR-028 (軟刪 user 持舊 JWT、per Clarifications Q3) | C10（更新為 8888 envelope） | SC-010 |

## Notes

- 所有檢查項 pass。3 個 clarification（樹狀 entity cascade / F12 hard_delete API 預留 / 軟刪 user 持舊 JWT）皆已整合
- F4 已建構的 envelope code namespace（含 6001 ENTITY_NOT_FOUND / 6003 STATE_CONFLICT / 8888 LOGOUT_SESSION_INVALIDATED）在 F3 沿用、不擴張
- F2 audit-log-infrastructure 平行進行時、F3 與 F2 透過 `server_model::admin::audit_log::write_in_txn` 內部 ActiveModel 介面解耦（per analyse 階段 C3）
- 2026-05-14 `/speckit-analyze` 階段 4 個 CRITICAL + 4 個 HIGH/MEDIUM finding 全數修正：
  - C1: FR-007 trait items 6→4（soft_delete/restore 移至 facade）
  - C2: FR-020/-022 method 名 `create_log()` → `audit_log::write_in_txn`
  - C3: audit helper 從 server-service 移到 server-model 避循環依賴
  - C4: 補 T044a server-middleware Cargo.toml 加 server-model dep
  - H1: FR-026/-027 + scenario 11 「parent_id」→「pid」
  - M1: 新 FR-029 scope boundary（INSERT/UPDATE 由 F2、HARD_DELETE 由 F12）
  - M2: T043 量化具體 7 個 _api.rs 檔
  - M3: T009 描述加 link 到 data-model E7 + 17 欄位 mapping 細節
- 下一步：直接進 `/speckit-implement`
