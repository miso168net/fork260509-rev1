---
type: community
cohesion: 0.33
members: 9
---

# Multi-Tenant Domain Service

**Cohesion:** 0.33 - loosely connected
**Members:** 9 nodes

## Members
- [[.check_domain_exists()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[.create_domain()_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[.delete_domain()_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[.find_paginated_domains()]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[.get_domain()_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[.update_domain()_1]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[SysDomainService]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[TDomainService]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs
- [[sys_domain_service.rs]] - code - fork260509-soybean-admin-rust/server/service/src/admin/sys_domain_service.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Multi-Tenant_Domain_Service
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_Sys Menu Service]]
- 5 edges to [[_COMMUNITY_Database Migrations]]
- 2 edges to [[_COMMUNITY_Multi-Tenant Domain Service]]

## Top bridge nodes
- [[.update_domain()_1]] - degree 6, connects to 3 communities
- [[.create_domain()_1]] - degree 5, connects to 3 communities
- [[.check_domain_exists()]] - degree 5, connects to 2 communities
- [[.delete_domain()_1]] - degree 4, connects to 2 communities
- [[.find_paginated_domains()]] - degree 3, connects to 2 communities