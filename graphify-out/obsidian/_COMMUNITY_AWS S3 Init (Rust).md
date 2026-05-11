---
type: community
cohesion: 0.30
members: 15
---

# AWS S3 Init (Rust)

**Cohesion:** 0.30 - loosely connected
**Members:** 15 nodes

## Members
- [[add_or_update_s3_pool()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[aws_s3_initialization.rs]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[create_s3_client()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[get_primary_s3_client()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[get_s3_pool_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[init()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[init_primary_s3()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[init_s3_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[init_s3_pool()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[init_s3_pools()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[remove_s3_pool()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[setup_logger()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[test_primary_s3_connection()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[test_s3_operations()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs
- [[test_s3_pool_operations()]] - code - fork260509-soybean-admin-rust/server/initialize/src/aws_s3_initialization.rs

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/AWS_S3_Init_Rust
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_Database Migrations]]
- 1 edge to [[_COMMUNITY_Rust Config & JWT]]

## Top bridge nodes
- [[init()]] - degree 5, connects to 1 community
- [[init_s3_connection()]] - degree 5, connects to 1 community
- [[init_s3_pool()]] - degree 5, connects to 1 community
- [[create_s3_client()]] - degree 4, connects to 1 community
- [[test_s3_operations()]] - degree 4, connects to 1 community