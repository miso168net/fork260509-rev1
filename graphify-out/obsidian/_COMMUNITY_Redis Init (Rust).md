---
type: community
cohesion: 0.22
members: 20
---

# Redis Init (Rust)

**Cohesion:** 0.22 - loosely connected
**Members:** 20 nodes

## Members
- [[add_or_update_redis_pool()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[create_cluster_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[create_redis_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[create_single_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[get_primary_redis()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[get_redis_pool_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[init()_3]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[init_primary_redis()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[init_redis_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[init_redis_pool()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[init_redis_pools()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[redis_initialization.rs]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[remove_redis_pool()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[setup_logger()_3]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[test_cluster_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[test_primary_redis_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[test_redis_basic_operations()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[test_redis_operations()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[test_redis_pool_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs
- [[test_single_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/redis_initialization.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Redis_Init_Rust
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Database Migrations]]
- 2 edges to [[_COMMUNITY_Rust App Bootstrap]]
- 1 edge to [[_COMMUNITY_Rust Config & JWT]]
- 1 edge to [[_COMMUNITY_Casbin Init (Rust)]]

## Top bridge nodes
- [[init()_3]] - degree 5, connects to 1 community
- [[init_redis_connection()]] - degree 5, connects to 1 community
- [[init_redis_pool()]] - degree 5, connects to 1 community
- [[create_cluster_connection()]] - degree 4, connects to 1 community
- [[create_single_connection()]] - degree 4, connects to 1 community