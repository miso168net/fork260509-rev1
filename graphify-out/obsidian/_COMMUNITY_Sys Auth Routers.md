---
type: community
cohesion: 0.18
members: 14
---

# Sys Auth Routers

**Cohesion:** 0.18 - loosely connected
**Members:** 14 nodes

## Members
- [[.get()]] - code - fork260509-soybean-admin-rust/server/global/src/global.rs
- [[.init_authentication_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[.init_authorization_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[.init_complex_sandbox_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_sandbox_route.rs
- [[.init_menu_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_menu_route.rs
- [[.init_protected_menu_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_menu_route.rs
- [[.init_protected_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[.init_simple_sandbox_router()]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_sandbox_route.rs
- [[SysAuthenticationRouter]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[SysMenuRouter]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_menu_route.rs
- [[SysSandboxRouter]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_sandbox_route.rs
- [[sys_authentication_route.rs]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[sys_menu_route.rs]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_menu_route.rs
- [[sys_sandbox_route.rs]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_sandbox_route.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Sys_Auth_Routers
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_Sys Misc Routers]]
- 4 edges to [[_COMMUNITY_Sys DomainRoleUser Routers]]
- 2 edges to [[_COMMUNITY_Rust Global State]]
- 1 edge to [[_COMMUNITY_test middleware rs]]
- 1 edge to [[_COMMUNITY_test middleware domain rs]]
- 1 edge to [[_COMMUNITY_Tab Bar Context Menu]]
- 1 edge to [[_COMMUNITY_Rust Search & Benchmarks]]
- 1 edge to [[_COMMUNITY_Rust Config & JWT]]
- 1 edge to [[_COMMUNITY_SysOrganizationRouter]]
- 1 edge to [[_COMMUNITY_Casbin Init (Rust)]]

## Top bridge nodes
- [[.get()]] - degree 21, connects to 9 communities
- [[.init_authorization_router()]] - degree 4, connects to 2 communities
- [[.init_protected_menu_router()]] - degree 4, connects to 2 communities