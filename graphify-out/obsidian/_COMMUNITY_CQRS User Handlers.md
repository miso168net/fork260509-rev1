---
type: community
cohesion: 0.06
members: 35
---

# CQRS User Handlers

**Cohesion:** 0.06 - loosely connected
**Members:** 35 nodes

## Members
- [[.canLogin()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[.constructor()_48]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-create.command.handler.ts
- [[.constructor()_49]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-delete.command.handler.ts
- [[.constructor()_62]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[.constructor()_20]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.constructor()_54]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts
- [[.created()_1]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[.deleteById()_1]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.deleteUserRoleByDomain()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.deleteUserRoleByRoleId()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.deleteUserRoleByUserId()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.deleted()_1]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[.execPasswordLogin()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts
- [[.execute()_6]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-create.command.handler.ts
- [[.execute()_7]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-delete.command.handler.ts
- [[.execute()_8]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-update.command.handler.ts
- [[.generateAccessToken()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts
- [[.loginUser()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[.refreshToken()_1]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts
- [[.save()_2]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.update()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[.verifyPassword()]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[AuthenticationService]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts
- [[User]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[UserCreateHandler]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-create.command.handler.ts
- [[UserDeleteHandler]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-delete.command.handler.ts
- [[UserUpdateHandler]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-update.command.handler.ts
- [[UserWriteRepository]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[authentication.service.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts
- [[user-create.command.handler.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-create.command.handler.ts
- [[user-delete.command.handler.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-delete.command.handler.ts
- [[user-update.command.handler.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/application/command-handlers/user-update.command.handler.ts
- [[user.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/domain/user.ts
- [[user.write.pg.repository.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/infra/bounded-contexts/iam/authentication/repository/user.write.pg.repository.ts
- [[user.write.repo-port.ts]] - code - fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/authentication/ports/user.write.repo-port.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/CQRS_User_Handlers
SORT file.name ASC
```
