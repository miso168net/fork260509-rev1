---
type: community
cohesion: 0.31
members: 10
---

# Rust Auth Events

**Cohesion:** 0.31 - loosely connected
**Members:** 10 nodes

## Members
- [[.check_login_security()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.find_first_valid_route()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.get_user_roles()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.get_user_routes()_1]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.pwd_login()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.pwd_login_with_security()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.send_login_event()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[.verify_password()]] - code - fork260509-soybean-admin-rust/server/utils/src/secure_util.rs
- [[.verify_user()]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs
- [[SysAuthService]] - code - /mnt/d/AnewSpaces/x_Project/fork260509/fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Rust_Auth_Events
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_Database Migrations]]
- 3 edges to [[_COMMUNITY_Rust Auth Events]]
- 2 edges to [[_COMMUNITY_Sys Menu Service]]
- 1 edge to [[_COMMUNITY_Casbin Adapter (Rust)]]
- 1 edge to [[_COMMUNITY_Rust Global State]]
- 1 edge to [[_COMMUNITY_tree util rs]]
- 1 edge to [[_COMMUNITY_id util ts]]

## Top bridge nodes
- [[.get_user_routes()_1]] - degree 4, connects to 3 communities
- [[.pwd_login()]] - degree 6, connects to 2 communities
- [[.verify_user()]] - degree 6, connects to 2 communities
- [[.send_login_event()]] - degree 4, connects to 2 communities
- [[.verify_password()]] - degree 3, connects to 2 communities