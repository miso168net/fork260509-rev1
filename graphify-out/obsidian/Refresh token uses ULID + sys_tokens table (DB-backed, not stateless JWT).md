---
source_file: "fork260509-soybean-admin-rust/server/service/src/admin/sys_auth_service.rs"
type: "rationale"
community: "Community None"
tags:
  - graphify/rationale
  - graphify/EXTRACTED
  - community/Community_None
---

# Refresh token uses ULID + sys_tokens table (DB-backed, not stateless JWT)

## Connections
- [[generate_auth_output]] - `rationale_for` [EXTRACTED]
- [[sys_tokens Model entity]] - `rationale_for` [EXTRACTED]

#graphify/rationale #graphify/EXTRACTED #community/Community_None