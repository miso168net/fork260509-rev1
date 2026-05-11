---
type: community
cohesion: 0.29
members: 7
---

# api key validate listener

**Cohesion:** 0.29 - loosely connected
**Members:** 7 nodes

## Members
- [[TAccessKeyService]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[api_key_validate_listener()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[event_channel_initialization.rs]] - code - fork260509-soybean-admin-rust/server/initialize/src/event_channel_initialization.rs
- [[initialize_event_channel()]] - code - fork260509-soybean-admin-rust/server/initialize/src/event_channel_initialization.rs
- [[jwt_created_listener()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[register_event_listeners()]] - code - fork260509-soybean-admin-rust/server/global/src/global.rs
- [[sys_access_key_service.rs]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/api_key_validate_listener
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Rust Global State]]
- 2 edges to [[_COMMUNITY_Rust Auth Events]]
- 1 edge to [[_COMMUNITY_Tab Bar Context Menu]]
- 1 edge to [[_COMMUNITY_Rust App Bootstrap]]
- 1 edge to [[_COMMUNITY_sys operation log listener]]
- 1 edge to [[_COMMUNITY_SysAccessKeyService]]

## Top bridge nodes
- [[initialize_event_channel()]] - degree 8, connects to 4 communities
- [[sys_access_key_service.rs]] - degree 3, connects to 1 community
- [[register_event_listeners()]] - degree 3, connects to 1 community
- [[jwt_created_listener()]] - degree 2, connects to 1 community