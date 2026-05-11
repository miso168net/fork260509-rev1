---
type: community
cohesion: 0.15
members: 14
---

# Admin Router 初始化 (Admin Router Init - Rust)

**Cohesion:** 0.15 - loosely connected
**Members:** 14 nodes

## Members
- [[Services enum]] - code - fork260509-soybean-admin-rust/server/initialize/src/router_initialization.rs
- [[SysAuthServiceget_user_routes]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[SysAuthenticationRouter_1]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[UserInfoOutput DTO]] - code - fork260509-soybean-admin-rust/server/model/src/admin/output/sys_authentication.rs
- [[UserRoute DTO]] - code - fork260509-soybean-admin-rust/server/model/src/admin/output/sys_authentication.rs
- [[apply_layers]] - code - fork260509-soybean-admin-rust/server/initialize/src/router_initialization.rs
- [[generate_id (route hash)]] - code - fork260509-soybean-admin-rust/server/initialize/src/router_initialization.rs
- [[get_user_info]] - code - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[get_user_routes (API)]] - code - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[handler_404]] - code - fork260509-soybean-admin-rust/server/initialize/src/router_initialization.rs
- [[init_authentication_router]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[init_protected_router]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[initialize_admin_router]] - code - fork260509-soybean-admin-rust/server/initialize/src/router_initialization.rs
- [[process_collected_routes]] - code - fork260509-soybean-admin-rust/server/initialize/src/router_initialization.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Admin_Router__Admin_Router_Init_-_Rust
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Authorization 路由與測試 (Authorization Router & Tests)]]
- 1 edge to [[_COMMUNITY_Auth Service (Rust)]]
- 1 edge to [[_COMMUNITY_Community 173]]

## Top bridge nodes
- [[initialize_admin_router]] - degree 6, connects to 1 community
- [[init_authentication_router]] - degree 3, connects to 1 community
- [[SysAuthenticationRouter_1]] - degree 3, connects to 1 community
- [[SysAuthServiceget_user_routes]] - degree 2, connects to 1 community