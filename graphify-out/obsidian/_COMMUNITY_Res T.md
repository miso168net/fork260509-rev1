---
type: community
cohesion: 0.25
members: 8
---

# Res T

**Cohesion:** 0.25 - loosely connected
**Members:** 8 nodes

## Members
- [[.from_request()]] - code - fork260509-soybean-admin-rust/server/core/src/web/auth.rs
- [[.into_response()]] - code - fork260509-soybean-admin-rust/server/core/src/web/error.rs
- [[.into_response()_1]] - code - fork260509-soybean-admin-rust/server/core/src/web/res.rs
- [[.new_error()]] - code - fork260509-soybean-admin-rust/server/core/src/web/res.rs
- [[.new_message()]] - code - fork260509-soybean-admin-rust/server/core/src/web/res.rs
- [[.new_paginated()]] - code - fork260509-soybean-admin-rust/server/core/src/web/res.rs
- [[.new_success()]] - code - fork260509-soybean-admin-rust/server/core/src/web/res.rs
- [[ResT]] - code - fork260509-soybean-admin-rust/server/core/src/web/res.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Res_T
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_API Key Middleware]]
- 1 edge to [[_COMMUNITY_auth rs]]
- 1 edge to [[_COMMUNITY_error rs]]
- 1 edge to [[_COMMUNITY_Sys Auth API]]
- 1 edge to [[_COMMUNITY_validator rs]]
- 1 edge to [[_COMMUNITY_Rust Config & JWT]]

## Top bridge nodes
- [[.new_error()]] - degree 6, connects to 3 communities
- [[ResT]] - degree 6, connects to 1 community
- [[.from_request()]] - degree 2, connects to 1 community
- [[.into_response()]] - degree 2, connects to 1 community