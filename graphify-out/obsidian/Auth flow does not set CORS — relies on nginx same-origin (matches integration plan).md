---
source_file: "fork260509-soybean-admin-rust/server/api/src/admin/sys_authentication_api.rs"
type: "rationale"
community: "Community None"
tags:
  - graphify/rationale
  - graphify/INFERRED
  - community/Community_None
---

# Auth flow does not set CORS — relies on nginx same-origin (matches integration plan)

## Connections
- [[login_handler]] - `rationale_for` [INFERRED]

#graphify/rationale #graphify/INFERRED #community/Community_None