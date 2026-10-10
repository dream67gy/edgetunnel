# 饭点事务所 · 共享奖池

手机、电脑共用的“今天吃什么”转盘。所有访问者都能添加、编辑、删除店铺，无需登录。

## 仓库分工：上游保持原样，Eat 独立维护

```text
_worker.js                上游原文件，合并更新时不补丁、不注入
wrangler.toml             上游配置，保持原样
.github/workflows/sync.yml 上游原有同步工作流，保持原样
eat/
  index.html              页面结构
  styles.css              响应式样式
  app.js                  转盘、菜单编辑、同步和本地记录
  api.js                  共享菜单 API，只依赖 EAT_DB
  worker.js               Eat 独立入口，完全不依赖代理或后台
  combined.js             薄适配层：Eat 路由优先，其余调用上游
  schema.sql              D1 建表 SQL
  build.py                生成部署产物，不修改源码
  tests/                  构建、路由、数据库和浏览器测试
```

**日常只改 `eat/`，不要把 Eat 代码粘进根目录 `_worker.js`。** 构建会把上游文件逐字节复制到产物中，再用 ES module 导入组合。没有字符串替换上游函数，也不依赖上游的变量名。CSS/JS 在源码中分离，发布时嵌入页面，避免与上游资源路径冲突。

`dist/` 已被上游 `.gitignore` 忽略，不提交生成代码。这次新增的工作流为 `.github/workflows/eat-checks.yml`，不会改写上游同步规则。

## 推荐：同域名部署（保留现有 /admin，增加 /eat）

在仓库根目录构建：

```sh
python3 eat/build.py
```

产物为 `dist/combined/`：Pages 支持的 `_worker.js/index.js` 模块入口，加上独立的上游/Eat 模块。

现有 Cloudflare Pages 项目 `yangzy723` 配置：

| 配置 | 填写值 |
|---|---|
| 框架预设 | None / 无 |
| 根目录 | 仓库根目录（通常留空） |
| 构建命令 | `python3 eat/build.py` |
| 构建输出目录 | `dist/combined` |
| D1 绑定变量名 | `EAT_DB` |

保留原有的环境变量、KV 绑定和域名。这里不改根目录的上游 `wrangler.toml`；通过 Pages 的构建设置选择产物。

**推送源码不等于完成配置。首次上线必须修改上面的构建命令和输出目录，配置 D1，再重新部署。若仍发布仓库根目录，只会部署原上游服务，`/eat` 不会接入。** 不要再按旧版说明手工上传根目录 `_worker.js` 来部署 Eat。

组合入口只处理 `/eat`、`/eat/` 的普通 GET/HEAD 和 `/eat/api/pool` 的 API 请求。其他请求（包括 WebSocket 升级、原 POST 通道和 `/admin`）把原 Request、env、ctx 原样交给上游；上游其他事件处理器和命名导出也保留。

## 独立部署：Eat 可脱离这个 fork

```sh
python3 eat/build.py --mode standalone
```

把 `dist/standalone` 作为另一个 Pages 项目的输出目录，绑定 `EAT_DB` 即可。根路径 `/` 会跳转到 `/eat`；产物不包含上游代码或代理功能。

也可以把整个 `eat/` 目录复制到另一个仓库，执行该目录里的 `build.py --mode standalone`。构建只使用 Eat 自己的源码，无需根目录的 `_worker.js`。若复制后仍保留 `eat/` 子目录布局，命令和输出目录完全相同。

两种部署想共用菜单就绑定同一个 D1 数据库，想独立菜单就各自绑定不同数据库。独立部署会有独立的网站地址；若仍要使用现有域名的 `/eat`，采用上面的组合部署最直接。

## 配置 Cloudflare D1

1. 控制台 → 存储和数据库 → D1 SQL Database，创建 `eat-shared`（名称可自定）。
2. 在数据库 SQL 控制台执行 [schema.sql](schema.sql)。可重复执行，不清空原数据。
3. 当前 Pages 项目 → 设置 → 绑定 → 添加 D1 数据库，变量名称填 **`EAT_DB`**，选择刚创建的数据库，应用到生产环境。
4. 重新部署，打开 `/eat`，顶部应显示“云端共用 · 已同步”。添加一家店，再用另一台设备验证。

预览环境建议绑定另一份测试数据库，以免预览操作改动正式菜单。数据库未绑定或未建表时会提示服务未连接，点击“同步”可查看错误并重试。

官方参考：[Pages D1 绑定](https://developers.cloudflare.com/pages/functions/bindings/)、[Pages 高级模式](https://developers.cloudflare.com/pages/functions/advanced-mode/)。

## 随时合并主仓库更新

推荐正常 merge，保留 fork 的提交历史：

```sh
# 仅首次需要；如果已有 upstream，先检查 git remote -v。
git remote add upstream https://github.com/cmliu/edgetunnel.git

# 合并前先提交或妥善保存本机修改。
git switch main
git pull --ff-only origin main
git fetch upstream main
git merge --no-edit upstream/main

# 校验、重建、推送。
python3 eat/build.py
node --test eat/tests/test_worker.mjs
git push origin main
```

也可在 GitHub Actions 手动运行现有 **Upstream Sync**。它原本包含每天定时同步；fork 可能需要在 Actions 页面启用工作流。由于新增内容位于 `eat/`，上游 `_worker.js` 的更新通常无需解决 Eat 相关冲突。若将来上游也新增同名目录或改掉 Worker 导出接口，仍需人工处理，不保证永远无冲突。不要选择会丢弃 fork 自有提交的强制对齐操作。

**Eat checks** 会在源码/上游入口更新时执行，并在 Upstream Sync 成功结束后再次校验默认分支，覆盖自动同步使用 GITHUB_TOKEN 推送不触发普通 push 工作流的情况。CI 产物可从 Actions 下载。

## 同步与保存约定

- 菜单和启用状态保存在 D1；时段筛选和抽奖记录属于当前设备。
- 打开页面、切回页面、恢复联网时同步；页面可见时每 8 秒检查更新。
- 正在编辑、确认或抽奖时暂缓拉取。多人同时保存用原子版本检查避免覆盖，过期写入返回 409，保留表单供用户确认后重试。
- 云端保存失败不会显示成功；本地缓存只用于离线查看，不能冒充已共享。
- 老版本机菜单不会自动覆盖云端，可通过“共享本机菜单”确认迁移。
- 支持 JSON 导入导出；导入替换所有人的菜单，记录只导入本机。
- API 为公开可写接口，最多 100 家店、100000 字节请求体。使用参数化 SQL 和主库读取；同源检查不是身份认证。

## 本地检查

需要 Python 3.11+、Node.js 22+（CI 使用 24）。构建和路由测试不需要 npm 包。

```sh
python3 eat/build.py
python3 eat/build.py --mode standalone
node --test eat/tests/test_worker.mjs

python3 -m pip install -r eat/tests/requirements.txt
python3 -m playwright install chromium
python3 eat/tests/test_cloud.py
python3 eat/tests/test_browser.py
```

浏览器测试使用独立上下文，优先使用 `CHROME_BIN` 指定的浏览器，否则使用本机 Chrome 或 Playwright Chromium，不读取个人浏览器资料。数据库测试运行真实 API JavaScript，通过 SQLite 模拟 D1；不能代替 Cloudflare 上线后的验证。

仅查看布局可执行 `python3 -m http.server 8080 --bind 127.0.0.1`，打开 `http://127.0.0.1:8080/eat/`。静态预览没有云端 API，因此会显示“共享未连接”。
