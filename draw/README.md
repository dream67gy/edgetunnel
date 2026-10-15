# 兴享好礼 /draw

与 Eat 同一域名下的独立抽奖页面，入口为 `/draw` 或 `/draw/`。
沿用当前 Cloudflare Pages 构建命令 `python3 eat/build.py` 和输出目录 `dist/combined`，无需增加域名或数据库绑定。
独立构建 `python3 eat/build.py --mode standalone` 同样包含该页面。

默认六类礼品：A5 计划本、维达抽纸、山茶花垃圾袋、金属手机支架、竹节随行杯、折叠环保袋。
抽纸默认每份 2 包，其余默认每份 1 件（单位可修改）。不使用原采购表中的数字作为库存或权重。

点击“活动设置”可开关礼品、修改名称/介绍/每份数量/单位、选择插画、添加或移除礼品（最多 12 款），也可隐藏每份数量。
已开启的礼品等概率中奖，每次一份，可重复中奖，不扣减库存。使用 Web Crypto 拒绝采样生成随机索引。
配置和最近 12 次抽奖记录仅保存在当前浏览器的 localStorage；清除浏览器数据会重置配置。不同设备不共享，设置入口也不是后台权限控制。

视觉采用蓝金配色和本地礼品照片，无第三方图片热链/字体/运行时依赖。四款采用检索到的外观相符商品图，笔记本和购物袋采用用户原图局部展示，具体来源与匹配限制见 [照片来源](images/SOURCES.md)。
构建将照片复制到 `/draw/images/`，使用内容哈希文件名与长期静态缓存；不会将照片塞进 Worker 或 HTML。加载失败时回退到原 SVG 插画。
品牌文字参考[兴业银行官网](https://www.cib.com.cn/)，未使用银行行徽。
动效仅在抽奖时运行，支持减少动态效果偏好。结果区预留固定高度，长文本可滚动，避免揭晓时页面跳动。

验证：

```sh
python3 eat/build.py
node --test eat/tests/test_worker.mjs
# 安装 eat/tests/requirements.txt 中的 Playwright 后运行，CHROME_BIN 可指定已有 Chromium。
python3 draw/tests/test_draw.py
```
