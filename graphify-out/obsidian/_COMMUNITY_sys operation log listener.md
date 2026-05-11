---
type: community
cohesion: 0.40
members: 6
---

# sys operation log listener

**Cohesion:** 0.40 - moderately connected
**Members:** 6 nodes

## Members
- [[.find_paginated_operation_logs()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_operation_log_service.rs
- [[.handle_operation_log_event()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_operation_log_service.rs
- [[SysOperationLogService]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_operation_log_service.rs
- [[TOperationLogService]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_operation_log_service.rs
- [[sys_operation_log_listener()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_operation_log_service.rs
- [[sys_operation_log_service.rs]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_operation_log_service.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/sys_operation_log_listener
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Database Migrations]]
- 2 edges to [[_COMMUNITY_Sys Menu Service]]
- 1 edge to [[_COMMUNITY_Multi-Tenant Domain Service]]
- 1 edge to [[_COMMUNITY_Rust Auth Events]]

## Top bridge nodes
- [[.handle_operation_log_event()]] - degree 5, connects to 3 communities
- [[.find_paginated_operation_logs()]] - degree 3, connects to 2 communities
- [[sys_operation_log_listener()]] - degree 3, connects to 1 community