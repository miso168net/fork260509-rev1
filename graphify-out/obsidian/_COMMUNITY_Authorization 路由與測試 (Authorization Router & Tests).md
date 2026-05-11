---
type: community
cohesion: 0.18
members: 12
---

# Authorization 路由與測試 (Authorization Router & Tests)

**Cohesion:** 0.18 - loosely connected
**Members:** 12 nodes

## Members
- [[FakeAuthLayer (Domain RBAC test)]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware_domain.rs
- [[FakeAuthLayer (RBAC test)]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware.rs
- [[FakeAuthLayer (set_enforcer test)]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_set_enforcer.rs
- [[FakeAuthMiddleware (Domain RBAC test)]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware_domain.rs
- [[FakeAuthMiddleware (RBAC test)]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware.rs
- [[assign_permission]] - code - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[assign_routes]] - code - fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs
- [[handler (RBAC test)]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware.rs
- [[init_authorization_router]] - code - fork260509-soybean-admin-rust/server/router/src/admin/sys_authentication_route.rs
- [[test_middleware test]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware.rs
- [[test_middleware_domain test]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_middleware_domain.rs
- [[test_set_enforcer test]] - code - fork260509-soybean-admin-rust/axum-casbin/tests/test_set_enforcer.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Authorization__Authorization_Router__Tests
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Admin Router 初始化 (Admin Router Init - Rust)]]
- 1 edge to [[_COMMUNITY_Community 72]]

## Top bridge nodes
- [[init_authorization_router]] - degree 4, connects to 1 community
- [[FakeAuthMiddleware (RBAC test)]] - degree 2, connects to 1 community