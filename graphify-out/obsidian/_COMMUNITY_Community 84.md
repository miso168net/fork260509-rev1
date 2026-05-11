---
type: community
cohesion: 0.20
members: 10
---

# Community 84

**Cohesion:** 0.20 - loosely connected
**Members:** 10 nodes

## Members
- [[AccessTokenEvent_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/events/access_token_event.rs
- [[AccessTokenEventhandle (persists sys_tokens row)]] - code - fork260509-soybean-admin-rust/server/service/src/admin/events/access_token_event.rs
- [[AuthEvent struct]] - code - fork260509-soybean-admin-rust/server/service/src/admin/event_handlers/auth_event_handler.rs
- [[AuthEventHandler_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/event_handlers/auth_event_handler.rs
- [[AuthEventHandlerhandle_login]] - code - fork260509-soybean-admin-rust/server/service/src/admin/event_handlers/auth_event_handler.rs
- [[Refresh token uses ULID + sys_tokens table (DB-backed, not stateless JWT)]] - rationale - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[auth_login_listener]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[handle_auth_event]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[send_login_event]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[sys_tokens Model entity]] - code - fork260509-soybean-admin-rust/server/model/src/admin/entities/sys_tokens.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_84
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Auth Service (Rust)]]

## Top bridge nodes
- [[Refresh token uses ULID + sys_tokens table (DB-backed, not stateless JWT)]] - degree 2, connects to 1 community
- [[send_login_event]] - degree 2, connects to 1 community