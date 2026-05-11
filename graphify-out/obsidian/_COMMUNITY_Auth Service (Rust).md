---
type: community
cohesion: 0.20
members: 12
---

# Auth Service (Rust)

**Cohesion:** 0.20 - loosely connected
**Members:** 12 nodes

## Members
- [[Auth flow does not set CORS — relies on nginx same-origin (matches integration plan)]] - rationale - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[AuthOutput DTO]] - code - fork260509-soybean-admin-rust/server/model/src/admin/output/sys_authentication.rs
- [[AuthOutput keeps refresh_token but commented out access_token (前端复用 NestJS)]] - rationale - fork260509-soybean-admin-rust/server/model/src/admin/output/sys_authentication.rs
- [[LoginInput DTO]] - code - fork260509-soybean-admin-rust/server/model/src/admin/input/sys_authentication.rs
- [[SysAuthService_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[SysAuthServicepwd_login]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[SysAuthenticationApi_1]] - code - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[TAuthService trait]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[generate_auth_output]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[get_user_roles]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[login_handler]] - code - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[verify_user]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Auth_Service_Rust
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Community 84]]
- 1 edge to [[_COMMUNITY_Admin Router 初始化 (Admin Router Init - Rust)]]

## Top bridge nodes
- [[login_handler]] - degree 7, connects to 1 community
- [[SysAuthServicepwd_login]] - degree 5, connects to 1 community
- [[generate_auth_output]] - degree 3, connects to 1 community