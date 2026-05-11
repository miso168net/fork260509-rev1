---
type: community
cohesion: 0.20
members: 16
---

# Alova Mock 與驗證碼 API (Alova Mock & Captcha API)

**Cohesion:** 0.20 - loosely connected
**Members:** 16 nodes

## Members
- [[Api.SystemManage.User type]] - code - fork260509-soybean-admin-base/src/typings/api/system-manage.d.ts
- [[App.Service.Response type_1]] - code - fork260509-soybean-admin-base/src/typings/app.d.ts
- [[Backend success code 0000 contract (matches VITE_SERVICE_SUCCESS_CODE)]] - rationale - fork260509-soybean-admin-base/src/service-alova/mocks/feature-users-20241014.ts
- [[UserModel type]] - code - fork260509-soybean-admin-base/src/service-alova/api/system-manage.ts
- [[addUser (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/system-manage.ts
- [[alova instance (createAlovaRequest)]] - code - fork260509-soybean-admin-base/src/service-alova/request/index.ts
- [[batchDeleteUser (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/system-manage.ts
- [[deleteUser (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/system-manage.ts
- [[feature-users-20241014 mock adapter]] - code - fork260509-soybean-admin-base/src/service-alova/mocks/feature-users-20241014.ts
- [[fetchGetUserList (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/system-manage.ts
- [[fetchGetUserList (axios)]] - code - fork260509-soybean-admin-base/src/service/api/system-manage.ts
- [[getAuthorization (alova shared)]] - code - fork260509-soybean-admin-base/src/service-alova/request/shared.ts
- [[mockAdapter (createAlovaMockAdapter)]] - code - fork260509-soybean-admin-base/src/service-alova/request/index.ts
- [[sendCaptcha (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/auth.ts
- [[updateUser (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/system-manage.ts
- [[verifyCaptcha (alova)]] - code - fork260509-soybean-admin-base/src/service-alova/api/auth.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Alova_Mock__API_Alova_Mock__Captcha_API
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Community 210]]
- 2 edges to [[_COMMUNITY_Auth 路由初始化 (Auth Route Init)]]
- 2 edges to [[_COMMUNITY_Community 427]]
- 1 edge to [[_COMMUNITY_Community 425]]
- 1 edge to [[_COMMUNITY_Community 524]]
- 1 edge to [[_COMMUNITY_Community 171]]
- 1 edge to [[_COMMUNITY_Community 138]]
- 1 edge to [[_COMMUNITY_Community 428]]
- 1 edge to [[_COMMUNITY_Community 526]]
- 1 edge to [[_COMMUNITY_Community 426]]
- 1 edge to [[_COMMUNITY_Community 525]]
- 1 edge to [[_COMMUNITY_Community 424]]

## Top bridge nodes
- [[alova instance (createAlovaRequest)]] - degree 26, connects to 12 communities