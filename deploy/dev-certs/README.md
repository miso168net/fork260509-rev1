# deploy/dev-certs/

本目錄存放 dev 環境自簽 TLS 憑證（W-F6）。

## 生成方式

```bash
bash deploy/generate-dev-cert.sh
```

產出：
- `fullchain.pem` — 公鑰憑證（644，可 import 進瀏覽器 / 系統信任庫）
- `privkey.pem`   — 私鑰（600，只在本機 dev 用，勿 commit）

## docker-compose.dev.yml 掛載對應

```yaml
front-nginx:
  volumes:
    - ./deploy/dev-certs:/etc/nginx/certs:ro   # ← 掛進容器
```

nginx 設定（`conf.d/default.conf`）從 `/etc/nginx/certs/` 讀取：
- `ssl_certificate     /etc/nginx/certs/fullchain.pem`
- `ssl_certificate_key /etc/nginx/certs/privkey.pem`

## 瀏覽器信任（選用）

首次訪問 `https://127.0.0.1:11443` 會出現 warning；若要消除：

```bash
# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain deploy/dev-certs/fullchain.pem

# Windows（PowerShell，以系統管理員執行）
Import-Certificate -FilePath deploy\dev-certs\fullchain.pem -CertStoreLocation Cert:\LocalMachine\Root
```

## 範疇邊界

- **Dev only**：本目錄僅供 dev overlay（`docker-compose.dev.yml`）使用。
- **Prod cert** 由 acme.sh + Let's Encrypt 管理，存入 named volume `front_nginx_certs`（W-F6b，Phase 5）。
- `*.pem` 已加進根 `.gitignore`，不會被 commit。
