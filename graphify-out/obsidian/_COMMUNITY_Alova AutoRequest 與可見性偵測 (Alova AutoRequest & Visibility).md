---
type: community
cohesion: 0.24
members: 12
---

# Alova AutoRequest 與可見性偵測 (Alova AutoRequest & Visibility)

**Cohesion:** 0.24 - loosely connected
**Members:** 12 nodes

## Members
- [[mockgetLastTime endpoint]] - rationale - fork260509-soybean-admin-base/src/views/alova/scenes/modules/browser-visibility-request.vue
- [[Alova useAutoRequest pattern]] - rationale - fork260509-soybean-admin-base/src/views/alova/scenes/modules/polling-request.vue
- [[BrowserVisibilityRequest Component]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/browser-visibility-request.vue
- [[CrossComponentRequest Component]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/cross-component-request.vue
- [[NetworkToggleRequest Component]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/network-toggle-request.vue
- [[PollingRequest Component]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/polling-request.vue
- [[actionDelegationMiddleware pattern]] - rationale - fork260509-soybean-admin-base/src/views/alova/scenes/modules/cross-component-request.vue
- [[getLastTime (visibility)]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/browser-visibility-request.vue
- [[handleAutoRequestSend]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/cross-component-request.vue
- [[toggleStop (browser visibility)]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/browser-visibility-request.vue
- [[toggleStop (network toggle)]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/network-toggle-request.vue
- [[toggleStop (polling)]] - code - fork260509-soybean-admin-base/src/views/alova/scenes/modules/polling-request.vue

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Alova_AutoRequest__Alova_AutoRequest__Visibility
SORT file.name ASC
```
