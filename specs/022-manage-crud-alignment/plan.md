# Implementation Plan: F7 — manage-crud-alignment

**Branch**: `022-manage-crud-alignment` | **Date**: 2026-05-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [`specs/022-manage-crud-alignment/spec.md`](./spec.md)

## Summary

F7 = **manage/* base view shape 對齊 + admin path Casbin 補位 feature**(application Phase 3 第二個 feature、F9 已落、F8 待)。RESEARCH §6.2 方案 B 路線下 base 不改、所有 shape adaptation 集中 rust 端;F9 補了 alias path、F7 補 alias response shape 對齊 base TS type + 補 ROLE_ADMIN 對既有 path 的 Casbin allow row 解 spec A-006 已知差異。

**Deliverable**(2 fold):
1. **Shape mapping**:rust 端 5 個 Output DTO(`SystemManageRoleOutput / SystemManageAllRoleOutput / SystemManageUserOutput / SystemManageMenuOutput / SystemManageMenuTreeNodeOutput`)+ `From<SysXxxModel>` impl + camelCase rename + 缺欄位 hardcode None/vec![];F9 alias 5 條 read mount 換 wrapper handler。
2. **Casbin admin path**:新 migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` INSERT 15 row 補 ROLE_ADMIN 對既有 `/user/* /role/* /route/*` path allow,解 A-006。

**Brainstorm 4 Q 拍板**(per [`docs/superpowers/022-feature-manage-crud-alignment.md`](../../docs/superpowers/022-feature-manage-crud-alignment.md)):
- Q1 scope → A(read-only path + endpoint shape 對齊)
- Q2 mapping 深度 → A(最小 mapping、只 rename rust 已有 column)
- Q3 Casbin admin row → A(補 15 row 解 A-006)
- Q4 acceptance → A(curl + psql + CDP browser smoke test)

**Approach 拍板** — A:Output DTO 集中(新建 `output/system_manage.rs` 集中 5 DTO)+ 新 alias-specific handler 集中(新建 `sys_system_manage_api.rs` 集中 5 wrapper)+ Casbin migration + CDP smoke test。

## Technical Context

**Language/Version**:Rust 1.86(rust-api worktree)+ TypeScript 5.x(base-web TS type contract)
**Primary Dependencies**:axum 0.8(handler + routing)、sea-orm 0.12+(ORM + migration + From impl pattern)、Casbin Rust(policy enforce、F11 v4='' baseline)、serde / serde_json(camelCase rename + DTO serialize)、tracing(unexpected default arm warn log)、既有 `SysRoleService` / `SysUserService` / `SysMenuService`(F9 已加 method、F7 不改)
**Storage**:PostgreSQL 17.4(`casbin_rule` 表新加 15 row + 既有 `sys_role` / `sys_menu` / `sys_user` 表 SELECT only、不改 schema)
**Testing**:**無 rust unit test**(per FR-021、F9/F11 同精神、stub-level + curl + CDP 已 cover);C-V 系列 inline bash + CDP browser smoke test
**Target Platform**:Linux server(docker container)+ WSL2 dev(host CDP browser test)
**Project Type**:web-service(rust-api 為主、base-web 不改、nestjs 不改、frontend shape mapping 在 rust 端做)
**Performance Goals**:F7 handler latency p99 ≤ 50ms(per NFR-006、純記憶體 model→DTO map + 1-2 DB call、應遠低於既有 endpoint;不主動 benchmark、留 W-F11 observability follow-up)
**Constraints**:rust-api image rebuild ≤ 5 min warm / ≤ 7 min cold(per NFR-005);F7 acceptance 整套 ≤ 30s(per NFR-001、不含 image rebuild)
**Scale/Scope**:**8 file rust patch、~270 LOC**(2 新建 Output DTO file + 1 新建 alias api file + 1 新建 migration + 4 改 register/route);**0 base-web 改 / 0 nestjs 改 / 0 docker-compose 改**(per Principle IV);**11 C-V acceptance scenarios(含 3 個 CDP sub-case)**

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### 5 Principle 對齊

| Principle | F7 對齊? | 說明 |
|---|---|---|
| **I. RBAC fail-safe(嚴版禁 Forward)** | ✅ PASS | F7 補 ROLE_ADMIN allow row 為「擴展 allow scope」、ROLE_USER 仍 default deny;Casbin enforce 為唯一 gate;不引入 forward(per FR-009/10/11/12 + US3.3 GU deny regression) |
| **II. Soft Delete + Audit + Migration 紀律** | ✅ PASS | F7 不動 schema、繼承 F2.1 audit hook + F3 soft delete facade(per FR-020 + US3.2);新 migration `m20260521` 對齊既有 F11/F9 pattern(per FR-011 + FR-014) |
| **III. 雙服務協作(嚴版禁 Forward / nginx 為 endpoint ownership 唯一權威)** | ✅ PASS | F7 不動 nginx config(per FR-018)、不引入 forward;alias path 仍 rust 完整 enforce |
| **IV. base 不改動邊界** | ✅ PASS | F7 不動 base-web src(per FR-015 + SC-014);所有 shape adaptation 集中 rust;CDP smoke test 為 black-box 驗 verification command、不寫 base e2e test code;Rationale「base 升級時阻力最小」對齊 |
| **V. 漸進收縮(DESIGN-A → DESIGN-B)** | ✅ PASS | F7 整套在 DESIGN-B 階段繼承(DESIGN-B §6 line 219 寫 identical);不引入 nestjs 依賴;Output DTO 在 DESIGN-B 仍合用 |

### Architectural Constraints 12 條對齊

| Constraint | F7 對齊? |
|---|---|
| 部署形態:docker 容器內編譯 + docker-compose 單機運行 | ✅ PASS(F7 不動 docker-compose、用 W-FA1 既有 stack) |
| 資料庫:PostgreSQL 為唯一持久狀態權威;rust 主導所有 migration | ✅ PASS(F7 新建 1 個 rust migration、無 nestjs schema 改) |
| 快取與 pub-sub:redis 為必要依賴 | N/A(F7 不動 redis、不引入新 pub-sub channel) |
| TLS:對外流量 MUST 走 TLS | N/A(F7 dev local 跑、無 prod 部署改動) |
| Secret 注入:Docker secrets + `_FILE` pattern | N/A(F7 不引入新 secret) |
| DB migration trigger:init container | ✅ PASS(F7 新 migration 由既有 init container 自動 rerun、per US3.1 + A-007) |
| Port 規劃:對外 port 用 1XXXX 前綴 | N/A(F7 不動 port) |
| Observability:promtail / Loki / grafana / prometheus | N/A(F7 不引入 obs、留 W-F11 follow-up;tracing::warn! for unexpected default arm 為 ops nice-to-have) |
| 結構化 log:rust/nestjs/nginx 統一 JSON | N/A(F7 不動 log infra) |
| Backup:pg_basebackup + WAL | N/A(F7 不動 backup) |
| 背景工作:cleanup / outbox / backup | N/A(F7 不引入背景 job、F12 為 cleanup-job follow-up feature) |
| CI/CD platform | N/A(F7 不引入 CI 改動;F7 image rebuild 為 dev 本機操作、W-FA3 既有 build script 仍有效) |

### Development Workflow 7 條對齊

| Workflow | F7 對齊? |
|---|---|
| spec-kit 流程紀律:specify → clarify → plan → tasks → implement | ✅ PASS(F7 走完 specify + clarify(saturated 0Q)+ plan、後續 tasks + implement) |
| Constitution Check 失敗 → Complexity Tracking 合理化 | ✅ PASS(0 violation、無需 Complexity Tracking) |
| 兩段式 commit 紀律 | ✅ PASS(F7 動 rust-api worktree、固定兩段式 commit、per FR-019) |
| Commit message:Conventional Commits + 中文 subject | ✅ PASS(對齊 F9/F11 既有 commit message 慣例) |
| Push 確認紀律 | ✅ PASS(F7 push 等 user 同意、per CLAUDE.md §5) |
| TLS 紀律(prod 不容跳過) | N/A(F7 dev 跑) |
| DESIGN 文件權威 + 抽離項升級紀律 | ✅ PASS(F7 引用 DESIGN-A §6.1 + DESIGN-B §6;F7 不是抽離項升級、不涉及) |

### 對齊總結

- **5 Principle**:5/5 PASS
- **Architectural Constraints**:5/12 PASS、7/12 N/A
- **Development Workflow**:5/7 PASS、2/7 N/A

**Total**:**15 PASS / 9 N/A / 0 violation**(對齊 F9 25 PASS / 7 N/A / 0 violation 形式、F7 因 scope 收緊 N/A 較多)

**Gate verdict**:✅ **PASS**,可進 Phase 0 research。

## Project Structure

### Documentation(this feature)

```text
specs/022-manage-crud-alignment/
├── plan.md                                  # /speckit-plan output(本檔)
├── research.md                              # Phase 0 output
├── data-model.md                            # Phase 1 output(5 Output DTO 細目 + Casbin migration row 表)
├── quickstart.md                            # Phase 1 output(F7 acceptance 走法總覽)
├── checklists/
│   └── requirements.md                      # spec-kit /speckit-specify 已建、16/16 PASS
├── contracts/
│   └── verification-commands.md             # Phase 1 output(11 C-V 完整 inline bash + CDP smoke)
├── spec.md                                  # /speckit-specify output(323 line)
└── tasks.md                                 # /speckit-tasks output(尚未建立)
```

### Source Code(repository root)

**Scope**:rust-api worktree 8 file ~270 LOC;base-web / nestjs / docker-compose 全 0 diff(per Principle IV)。

```text
rust-api/                                                                # rust-api worktree
├── server/
│   ├── model/src/admin/
│   │   ├── output/
│   │   │   ├── system_manage.rs                                         # 新建、~120 LOC
│   │   │   │   ├── SystemManageRoleOutput        + From<SysRoleModel>
│   │   │   │   ├── SystemManageAllRoleOutput     + From<SysRoleModel>
│   │   │   │   ├── SystemManageUserOutput        + From<SysUserModel>
│   │   │   │   ├── SystemManageMenuOutput        + From<SysMenuModel>
│   │   │   │   └── SystemManageMenuTreeNodeOutput + From<MenuTree>(遞迴)
│   │   │   └── mod.rs                                                    # 改 +1 LOC(加 mod + re-export)
│   ├── api/src/admin/
│   │   ├── sys_system_manage_api.rs                                     # 新建、~80 LOC
│   │   │   ├── list_roles_for_systemmanage
│   │   │   ├── list_all_roles_for_systemmanage
│   │   │   ├── list_users_for_systemmanage
│   │   │   ├── list_menu_for_systemmanage
│   │   │   └── tree_menu_for_systemmanage
│   │   └── mod.rs                                                        # 改 +2 LOC(加 mod + re-export SysSystemManageApi)
│   └── router/src/admin/
│       └── sys_system_manage_route.rs                                    # F9 既有檔、F7 改 ~10 LOC
│                                                                          # 5 條 read alias mount 換新 wrapper handler
│                                                                          # import 加 SysSystemManageApi
├── migration/src/
│   ├── datas/
│   │   ├── m20260521_a_f7_admin_role_existing_paths_seed.rs            # 新建、~60 LOC
│   │   │   ├── up()  INSERT 15 row(ROLE_ADMIN × /user/* /role/* /route/*)
│   │   │   └── down() DELETE 15 row scope-limited
│   │   └── mod.rs                                                        # 改 +1 LOC
│   └── lib.rs                                                            # 改 +2 LOC(Migrator vec 加 m20260521)

base-web/                                                                # 0 diff(per Principle IV + FR-015 + SC-014)
fork260509-soybean-admin-nestjs/                                         # 0 diff(per FR-016 + SC-015)
docker-compose.yml / docker-compose.dev.yml / docker-compose.prod.yml   # 0 diff(per FR-017 + SC-016)
```

**Structure Decision**:對齊 F9 既有「`sys_system_manage_route.rs` 集中 alias mount」延伸 — 「`sys_system_manage_api.rs` 集中 alias wrapper handler + `output/system_manage.rs` 集中 alias output DTO」、boundary 清晰、future maintenance 良好。**Output DTO 集中(approach A)**:`server/model/src/admin/output/system_manage.rs` 為**新建模組**(既有 codebase 沒 `output/` 集中 module、F7 為第一個 establishing 此 module);若 future 新增 alias output 可同 module 加入。

## Complexity Tracking

**0 violation**、無需 Complexity Tracking。

F7 scope 收緊到 ~8 file ~270 LOC,5 Principle 全 PASS,Architectural Constraints 5 PASS + 7 N/A,Development Workflow 5 PASS + 2 N/A — 無任何違反需要 Complexity Tracking 表內合理化。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (空 — 0 violation) | — | — |

---

## Phase 0 — research.md(下一步輸出)

Brainstorm 4 Q 已 saturated、無 NEEDS CLARIFICATION marker(per `/speckit-clarify` 0 question)。Phase 0 research **沒有 critical unknown 需 dispatch research agent**,但有以下 best-practice / pattern research item 值得文件化:

1. **R-Q1**:既有 codebase 是否已有 `output/` module 集中慣例?(grep evidence、F7 是否第一個 establishing 還是延伸既有)
2. **R-Q2**:rust 既有 `SysMenuModel` 的 `menu_type / icon_type` column type(`enum` vs `String`)+ rust 序列化行為(`"menu"` / `"directory"` vs `"1"` / `"2"`)→ 確認 mapping 對照表
3. **R-Q3**:既有 `SysRoleModel.description` / `SysUserModel.phone_number` 的 nullability(Option<String> vs String)+ F7 DTO unwrap_or_default vs Option 保留決策
4. **R-Q4**:CDP smoke test 在 WSL2 環境的既有 setup(F5.1 follow-up 已用、F7 沿用、確認 navigate API + DOM query 方式)
5. **R-Q5**:既有 m20260520(F9 Casbin migration)的 SQL pattern(`raw INSERT` / `Statement::from_string`)— F7 m20260521 對齊
6. **R-Q6**:`MenuTree` 既有 entity 結構(`children: Vec<MenuTree>`)+ 對齊 base TS type `MenuTree = {id, label, pId, children}` 的 mapping 邏輯

Phase 0 將在 `research.md` 文件化每個 R-Q 的:
- Decision:[what was chosen]
- Rationale:[why chosen]
- Alternatives considered:[what else evaluated]

## Phase 1 — data-model.md + contracts/ + quickstart.md(Phase 0 後輸出)

### data-model.md(預期 6-7 個 E)

- **E1**:`SystemManageRoleOutput` struct + From impl + field-by-field 對照表
- **E2**:`SystemManageAllRoleOutput` struct + From impl(`Pick<Role, 'id'|'roleName'|'roleCode'>`)
- **E3**:`SystemManageUserOutput` struct + From impl + 缺欄位 hardcode 邏輯
- **E4**:`SystemManageMenuOutput` struct + From impl + `menu_type / icon_type` 映射表 + tracing::warn! 預設
- **E5**:`SystemManageMenuTreeNodeOutput` struct + From impl + 遞迴展開邏輯
- **E6**:`SysSystemManageApi` 5 個 wrapper handler signature 與 implementation
- **E7**:Casbin migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` 完整 INSERT 15 row + down() scope-limited DELETE

### contracts/verification-commands.md(11 個 C-V)

- C-V1:rust image rebuild OK
- C-V2:migration `m20260521` 跑 + 15 row 落 DB(psql verify)
- C-V3:Soybean 5 條 read alias shape 對齊(curl + jq verify)
- C-V4:Administrator 5 條 read alias allow + shape 對齊
- C-V5:Administrator 既有 `/api/user/* /api/role/*` 5 條 path allow(解 A-006)
- C-V6:Menu CRUD admin path(POST/PUT/DELETE /api/route/)+ soft delete + audit
- C-V7:GeneralUser deny regression(envelope 5001)
- C-V8:three-side scope verify(0 diff base/nestjs/compose)
- C-V9:W-FA1 stack regression(6 healthy + migration exited 0)
- C-V10:CDP browser smoke test 3 view + column render(3 sub-case)

### quickstart.md

- F7 acceptance 走法總覽(對齊 F9 quickstart 慣例)
- 故障排查段(預期 friction 落點 per NFR-003)
- C-V execution order
- 預期 11/11 PASS 與 13/13 US scenario 對應

## Re-evaluation post Phase 1 design

Phase 1 完成後 re-run Constitution Check;預期維持 **15 PASS / 9 N/A / 0 violation**(無新 violation surface)。

## Ready for `/speckit-tasks`

Plan 階段完成後、Phase 0 research.md + Phase 1 data-model.md + contracts/ + quickstart.md 都已就位,即可進入 `/speckit-tasks` 生成 task list。

**預估 task 數**:~22 task(per NFR-002、對齊 F11 ~24 / F9 ~29 等比放小)。
**預估 acceptance 跑時間**:~4-6 min(含 image rebuild 3-5 min + 11 C-V 20-30s)。
