# 兴享好礼 /draw

与 Eat 同一域名下的独立抽奖页面，入口为 `/draw` 或 `/draw/`。
沿用当前 Cloudflare Pages 构建命令 `python3 eat/build.py` 和输出目录 `dist/combined`，无需增加域名。云端配置复用 `EAT_DB` 数据库和 `KV` 命名空间绑定。
独立构建 `python3 eat/build.py --mode standalone` 同样包含该页面。

默认六类礼品：A5 计划本、维达抽纸、山茶花垃圾袋、金属手机支架、竹节随行杯、折叠环保袋。
抽纸默认每份 2 包，其余默认每份 1 件（单位可修改）。不使用原采购表中的数字作为库存或权重。

点击“活动设置”可开关礼品、修改名称/介绍/每份数量/单位、选择展示图片、添加或移除礼品（最多 12 款），也可隐藏每份数量。
已开启的礼品等概率中奖，每次一份，可重复中奖，不扣减库存。由 Worker 使用 Web Crypto 拒绝采样生成随机索引，每次抽奖读取 D1 主库中的最新配置快照。
礼品配置、数量展示开关和活动启停保存在 D1，全设备共享。页面在前台每 8 秒及重新聚焦时同步；每次抽奖再次由服务端检查最新活动状态。编辑过程中保留草稿，保存使用版本号防止覆盖他人的更新。
最近 12 次抽奖记录仅保存在当前浏览器的 localStorage，不上传服务端；清除浏览器数据会删除个人记录。没有账号登录，因此这里的“私有”以浏览器配置文件为边界，同一浏览器的使用者会共享这些本地记录。旧版本的本地礼品设置不再覆盖云端配置。

## Cloudflare 配置

1. Pages → 当前项目 → Settings → Bindings，确认 D1 绑定 `EAT_DB`（与 Eat 共用）。也支持独立的 `DRAW_DB`，存在时优先使用。
2. 确认 Workers KV 命名空间绑定名为 `KV`；也支持专用 `DRAW_KV`，存在时优先使用。
3. 在对应 KV 命名空间中新增键 **`DRAW_ADMIN_PASSWORD`**，值填写管理员指定的密码。不要把密码写入源代码、构建变量或公开页面。
4. 绑定有变更时重新部署。首次访问会自动建立 `draw_config`、`draw_auth_attempts` 两张表并初始化六款礼品，无需手动执行 SQL，不修改 Eat 表。

管理密码只在服务端从 KV 读取。验证成功签发 30 分钟的 HttpOnly / Secure / SameSite=Strict Cookie；会话不存放在 localStorage。每个来源 IP 在 15 分钟内最多尝试 10 次，成功后清零；失败计数保存为 IP 哈希。没有密码或数据库绑定时不会退回无密码管理或本地抽奖。
修改 KV 密码可使旧会话失效，但 [KV 为最终一致存储](https://developers.cloudflare.com/kv/concepts/how-kv-works/)，跨区域更新可能延迟 60 秒或更久。奖池使用 D1 主库读取及原子版本更新，避免用 KV 保存需要并发控制的活动配置。

接口：`GET /draw/api/config` 读取共享配置；`POST /draw/api/draw` 取得当前快照及中奖结果；`POST /draw/api/auth` 登录；`GET /draw/api/auth` 检查会话；`DELETE /draw/api/auth` 注销；`PUT /draw/api/config` 需要有效管理会话。接口均禁止缓存，配置 GET 支持 ETag，修改接口检查请求来源。返回中不包含密码或他人的抽奖记录。

当前不限库存、次数，也不维护全局正在播放的动画或领奖状态。每位访客独立抽奖；所有人使用同一份活动配置。

视觉采用蓝金配色和本地礼品照片，无第三方图片热链/字体/运行时依赖。四款采用检索到的外观相符商品图，笔记本和购物袋采用用户原图局部展示，具体来源与匹配限制见 [照片来源](images/SOURCES.md)。
构建将照片复制到 `/draw/images/`，使用内容哈希文件名与长期静态缓存；不会将照片塞进 Worker 或 HTML。加载失败时回退到原 SVG 插画。
页头使用[兴业银行官网](https://www.cib.com.cn/)当前的原版 Logo（行徽及中英文组合），本地托管，保持原始比例与配色。
动效仅在抽奖时运行，支持减少动态效果偏好。结果区预留固定高度，长文本可滚动，避免揭晓时页面跳动。

验证：

```sh
python3 eat/build.py
node --test eat/tests/test_worker.mjs
# 安装 eat/tests/requirements.txt 中的 Playwright 后运行，CHROME_BIN 可指定已有 Chromium。
python3 draw/tests/test_draw.py
python3 draw/tests/test_shared.py
```
