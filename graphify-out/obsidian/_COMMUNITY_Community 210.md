---
type: community
cohesion: 0.50
members: 5
---

# Community 210

**Cohesion:** 0.50 - moderately connected
**Members:** 5 nodes

## Members
- [[Token refresh & expired-code-based detection]] - rationale - fork260509-soybean-admin-base/src/service-alova/request/index.ts
- [[fetchRefreshToken (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/auth.ts
- [[fetchRefreshToken (axios)]] - code - fork260509-soybean-admin-base/src/service/api/auth.ts
- [[handleRefreshToken (alova shared)]] - code - fork260509-soybean-admin-base/src/service-alova/request/shared.ts
- [[tokenRefresher (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/request/index.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_210
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Alova Mock 與驗證碼 API (Alova Mock & Captcha API)]]

## Top bridge nodes
- [[fetchRefreshToken (alova)]] - degree 3, connects to 1 community
- [[tokenRefresher (alova)]] - degree 3, connects to 1 community