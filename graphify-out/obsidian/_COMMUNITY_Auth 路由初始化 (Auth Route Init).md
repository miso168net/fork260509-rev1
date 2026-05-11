---
type: community
cohesion: 0.18
members: 14
---

# Auth 路由初始化 (Auth Route Init)

**Cohesion:** 0.18 - loosely connected
**Members:** 14 nodes

## Members
- [[Static vs dynamic auth route mode]] - rationale - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[addRoutesToVueRouter]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[fetchGetConstantRoutes (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/route.ts
- [[fetchGetConstantRoutes (axios)]] - code - fork260509-soybean-admin-base/src/service/api/route.ts
- [[fetchGetUserRoutes (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/route.ts
- [[fetchGetUserRoutes (axios)]] - code - fork260509-soybean-admin-base/src/service/api/route.ts
- [[getAuthVueRoutes]] - code - fork260509-soybean-admin-base/src/router/routes/index.ts
- [[handleConstantAndAuthRoutes]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[initAuthRoute]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[initConstantRoute]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[initDynamicAuthRoute]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[initStaticAuthRoute]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[resetStore (route)]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts
- [[resetVueRoutes]] - code - fork260509-soybean-admin-base/src/store/modules/route/index.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Auth__Auth_Route_Init
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Community 138]]
- 2 edges to [[_COMMUNITY_Alova Mock 與驗證碼 API (Alova Mock & Captcha API)]]

## Top bridge nodes
- [[initConstantRoute]] - degree 5, connects to 1 community
- [[initStaticAuthRoute]] - degree 3, connects to 1 community
- [[fetchGetConstantRoutes (alova)]] - degree 2, connects to 1 community
- [[fetchGetUserRoutes (alova)]] - degree 2, connects to 1 community