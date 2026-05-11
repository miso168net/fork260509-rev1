---
type: community
cohesion: 0.38
members: 7
---

# SysAccessKeyService

**Cohesion:** 0.38 - loosely connected
**Members:** 7 nodes

## Members
- [[.create_access_key()_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[.create_access_key_in_transaction()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[.delete_access_key()_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[.delete_access_key_in_transaction()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[.find_paginated_access_keys()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[.initialize_access_key()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs
- [[SysAccessKeyService]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_access_key_service.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SysAccessKeyService
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_Database Migrations]]
- 5 edges to [[_COMMUNITY_Multi-Tenant Domain Service]]
- 1 edge to [[_COMMUNITY_api key validate listener]]

## Top bridge nodes
- [[.create_access_key()_1]] - degree 5, connects to 2 communities
- [[.delete_access_key()_1]] - degree 4, connects to 2 communities
- [[.find_paginated_access_keys()]] - degree 3, connects to 2 communities
- [[.initialize_access_key()]] - degree 3, connects to 2 communities
- [[SysAccessKeyService]] - degree 7, connects to 1 community