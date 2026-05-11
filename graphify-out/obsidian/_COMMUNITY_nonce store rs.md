---
type: community
cohesion: 0.38
members: 7
---

# nonce store rs

**Cohesion:** 0.38 - loosely connected
**Members:** 7 nodes

## Members
- [[.check_and_set()_1]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs
- [[NonceStore]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs
- [[create_memory_store()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs
- [[create_memory_store_factory()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs
- [[create_redis_store()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs
- [[create_redis_store_factory()]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs
- [[nonce_store.rs]] - code - fork260509-soybean-admin-rust/server/core/src/sign/nonce_store.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/nonce_store_rs
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_API Key Auth (Rust)]]
- 1 edge to [[_COMMUNITY_MemoryNonceStore]]
- 1 edge to [[_COMMUNITY_redis nonce store rs]]

## Top bridge nodes
- [[create_memory_store_factory()]] - degree 4, connects to 2 communities
- [[create_redis_store_factory()]] - degree 3, connects to 1 community