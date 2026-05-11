---
type: community
cohesion: 0.25
members: 9
---

# Casbin Init (Rust)

**Cohesion:** 0.25 - loosely connected
**Members:** 9 nodes

## Members
- [[ApiKeyEvent]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[ValidatorType]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[add_key()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[get_complex_validator()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[get_simple_validator()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[init_validators()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[init_validators_with_nonce_store()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[mod.rs_5]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs
- [[remove_key()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/mod.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Casbin_Init_Rust
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_router initialization rs]]
- 1 edge to [[_COMMUNITY_API Key Auth (Rust)]]
- 1 edge to [[_COMMUNITY_MemoryNonceStore]]

## Top bridge nodes
- [[init_validators_with_nonce_store()]] - degree 4, connects to 2 communities
- [[init_validators()]] - degree 3, connects to 1 community
- [[get_complex_validator()]] - degree 2, connects to 1 community
- [[get_simple_validator()]] - degree 2, connects to 1 community