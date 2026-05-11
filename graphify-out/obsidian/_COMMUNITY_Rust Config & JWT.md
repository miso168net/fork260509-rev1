---
type: community
cohesion: 0.29
members: 8
---

# Rust Config & JWT

**Cohesion:** 0.29 - loosely connected
**Members:** 8 nodes

## Members
- [[generate_jwt()]] - code - fork260509-soybean-admin-rust/server/initialize/tests/jwt_auth_middleware.rs
- [[initialize_keys_and_validation()]] - code - fork260509-soybean-admin-rust/server/initialize/src/jwt_initialization.rs
- [[jwt.rs_2]] - code - fork260509-soybean-admin-rust/server/middleware/src/jwt.rs
- [[jwt_auth_middleware()]] - code - fork260509-soybean-admin-rust/server/middleware/src/jwt.rs
- [[jwt_auth_middleware.rs]] - code - fork260509-soybean-admin-rust/server/initialize/tests/jwt_auth_middleware.rs
- [[jwt_initialization.rs]] - code - fork260509-soybean-admin-rust/server/initialize/src/jwt_initialization.rs
- [[test_user_info_endpoint()]] - code - fork260509-soybean-admin-rust/server/initialize/tests/jwt_auth_middleware.rs
- [[user_info_handler()]] - code - fork260509-soybean-admin-rust/server/initialize/tests/jwt_auth_middleware.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Rust_Config__JWT
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Rust Config & JWT]]
- 1 edge to [[_COMMUNITY_Rust App Bootstrap]]
- 1 edge to [[_COMMUNITY_Res T]]
- 1 edge to [[_COMMUNITY_Sys Auth API]]
- 1 edge to [[_COMMUNITY_Sys Misc Routers]]
- 1 edge to [[_COMMUNITY_Rust Config & JWT]]
- 1 edge to [[_COMMUNITY_router initialization rs]]

## Top bridge nodes
- [[jwt_auth_middleware()]] - degree 5, connects to 3 communities
- [[test_user_info_endpoint()]] - degree 6, connects to 2 communities
- [[initialize_keys_and_validation()]] - degree 4, connects to 2 communities
- [[user_info_handler()]] - degree 2, connects to 1 community