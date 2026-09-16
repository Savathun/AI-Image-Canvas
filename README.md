# CTMOAI 创作画布（可复用 Sites 模板）

私有 ChatGPT Sites 应用，供用户手动使用 CTMOAI 生图 API。不是 MCP，也不依赖用户电脑上的服务。Key 每次打开输入，页面内存和当前 Worker 请求中使用，不持久化。

## 交给 AI 助手部署

把本仓库链接交给具备 ChatGPT Sites 权限的 AI 助手，并发送：

> 请把这个 GitHub 仓库作为现有 Sites 项目模板导入到我的账号。为我创建一个新的私有 Site，保留现有架构、D1 数据库、R2 存储、迁移、界面与功能；不要复用别人的 project_id，不要进行真实付费生图测试。完成依赖安装、构建、验证、数据库迁移和私有发布后，把新站点链接发给我。

仓库已经移除原站点的项目 ID、域名、OAuth Client ID、API Key、运行时数据与旧 Git 历史。新部署会创建独立的 D1/R2 资源，不会复制原账号中的任务、图片、画布或 Google Drive 授权。

部署完成后：

1. 在新站点中输入使用者自己的 CTMOAI API Key；Key 仅保存在当前页面内存。
2. 如需 Google Drive，使用者在自己的 Google Cloud 项目中启用 Drive API、创建 Web OAuth Client ID，并把新站点的完整 origin 加入“已获授权的 JavaScript 来源”。
3. 在站点“保存与 Drive”中填写该公开 Client ID。不要填写或上传 Client Secret。

## 画布与生成

- DOM 世界坐标画布：自由拖动、左键框选、Shift 多选与多图拖动、空格/中键平移、滚轮锚点缩放、适应、右键菜单、删除只移出画布、布局撤销重做。
- 左键双击打开独立原图预览，支持适应、100%、滚轮缩放及拖动；右键不提供查看大图。裁切、画笔、箭头、矩形、文字，独立编辑撤销重做，另存副本并保留编辑来源与操作记录。像素尺寸保持原图，裁切除外。
- 模型、1K/2K/4K、已验证的 10 种比例；每组 1–8 次独立生成，同时运行最多 3 个；本页最多 12 个运行/排队任务。提交后可继续编辑下一组。取消仅影响未开始的任务；不重试供应商请求。当前页应保持打开，连接未知时先检查供应商记录。
- 最多 14 张有序 PNG/JPEG/WebP 参考原图，支持多选添加、逐张移除和上下调整顺序。按 Google 内嵌请求规范限制整次 UTF-8 JSON 请求为 20 MB（20,000,000 字节，包含 Base64 图片及提示词），不再限制单图 4 MiB。导入原图的 20 MiB/8000 万像素仍是本应用保护边界，与提交预算分开。中转站可能另有限制，尚未验证 Files API，未虚构上传接口。

## 数据与保存

- `jobs`：30 天普通任务、参数、状态。旧版 R2 原图继续兼容。
- `assets`：图片档案、尺寸、SHA-256、来源参数/编辑记录、512 px / 128 KiB 以下缩略图，以及用户主动归档的 Drive 文件 ID；最多 2000 项。手动删除。
- `workspaces`：当前画布 JSON、修订号和公开 Google OAuth Client ID。乐观锁拒绝过期覆盖，冲突时提供布局导出后重载。
- **新生成原图/参考原图不写入 R2**。原图随 NDJSON 最终结果交给浏览器，写 IndexedDB 恢复缓存；缓存失败时保留页面内存，发起下载并停止后续生成。页面中断前尚未交付的原图无法由本站恢复。
- File System Access 可用时，用户选择文件夹后自动写原图并重新读取校验。其他浏览器提供标准下载，标记“下载已发起”；无法证明用户已完成磁盘保存。原图缓存不自动驱逐，不等于备份。
- 页面重新打开清除 API Key。IndexedDB 仅原图、文件夹句柄、文件保存状态；没有 Key 或 OAuth token。
- 新电脑读到相同画布和缩略图，但原图须本地重选（按 SHA-256 验证）或从 Drive 恢复。不会用缩略图代替原图参考/编辑。
- 旧任务原图加入档案后排除普通到期清理。删除档案不删除本地或 Drive 文件；旧云端文件恢复任务的正常到期策略。
- 云端总图像应用限额 256 MiB，包括旧原图与新缩略图。保留/删除规则在设置中说明。

## 可选 Google Drive

采用 Google Identity Services token model 与 `drive.file`，浏览器直接上传；站点与 ChatGPT 已安装的 Drive 插件授权相互独立。令牌只保留页面内存，过期手动重连。

一次性设置：启用 Google Drive API，配置 OAuth consent（测试模式添加自己），创建 Web OAuth Client ID，将新部署站点的完整 origin（例如 `https://YOUR-SLUG.YOUR-WORKSPACE.chatgpt.site`）加入授权 JavaScript 来源。在站点“保存与 Drive”填写 Client ID 并连接。无需 Client Secret、额外服务器或 Railway。

仅选中图片点击上传后归档；文件位于当前授权账号的 My Drive 根目录。可恢复上传会话仅在内存，重复点击共用一次上传，同一图片重试先按 appProperties 查已完成文件。读取远端文件并核对 SHA-256 后才记录归档成功。恢复时再次核对 SHA-256。若网络中断则保留原图，不假定上传成功。手动删除云端文件之后恢复将报错。

官方依据：
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/drive/api/guides/manage-uploads

## 开发与部署

`npm run build` 打包模块化前端为单个脚本并内嵌 ESM Worker；`npm test` 在 Miniflare D1/R2 和实际 workerd 中用模拟供应商验证，不产生付费请求；`npm run validate` 检查构建入口。

追加 Drizzle 迁移，禁止修改已发布迁移。构建把迁移复制到 `dist/.openai/drizzle`。按 Sites 流程推送准确源码 SHA、打包 dist、保存版本、私有发布。保留 D1 `DB`、R2 `BUCKET` 与既有用户访问范围。

应用不使用服务端 `IMAGE_API_KEY`。API Key 由使用者在每次打开页面后手动输入，只存在于页面内存和当次 Worker 请求中。不要把 Key 写入源码、Sites 环境变量、数据库、日志或浏览器存储。

## 验证边界

服务器模拟回归覆盖原流程及本地交付、无云端原图、缩略图权限、画布冲突、Drive 记录哈希约束、旧原图保留。此前用户已确认真实 CTMOAI 生图成功，本次不重复使用用户额度。

本版本没有进行真实 Google 账号授权/上传（缺少站点 OAuth Client ID）；未进行浏览器交互自动化测试。托管环境规定普通编辑不启动浏览器预览，现有原生 Worker 也没有兼容的预览开发服务器。构建与服务器测试不能证明所有浏览器上的文件夹权限、弹窗或编辑手势表现。

## 参考图规范更新（2026-09-15）

依据：https://ai.google.dev/gemini-api/docs/image-generation （最多 14 张）与 https://ai.google.dev/gemini-api/docs/image-understanding （内嵌请求总计 20 MB）。保留中转站既有 model/endpoint 标识，未改成 Google 直连。提交时自动处理发送副本，界面不再显示大小预算；原文件不改变。新 metadata.reference_asset_ids 按顺序记录全部参考图，兼容旧 reference_asset_id；从档案或近期任务载入参数会恢复多图顺序。

`node scripts/test-references.mjs` 覆盖 14/15 张边界、顺序、单图超过 4 MiB 与 20 MB UTF-8 请求预算；`npm test` 覆盖实际 workerd 向模拟供应商转发多图及档案来源。未使用用户 Key 或进行付费中转站多图实测。

## 自适应参考图副本（2026-09-15）

提交阶段在浏览器内准备参考图，不写入原图恢复缓存、不上传原图至站点。整次编码请求目标 19,500,000 字节，保留 500,000 字节余量。已满足目标则原样发送；超过目标时保留小图片，按原文件大小分配其余预算，顺序处理 WebP 副本（保留透明度）：先在原尺寸搜索质量 0.78–0.96，必要时等比缩小。用最终完整 JSON 的 UTF-8 字节数校验，不能满足则中止，不调用供应商。不会为了接近上限而放大或填充图片。

忙碌锁在准备前生效，避免双击提交；“停止”在准备阶段终止待发送请求，生成阶段仍只取消未开始次数。批次重复使用同一组已准备副本。档案记录 reference_preparation 的原始/提交大小、提交尺寸、格式、压缩标记与质量参数；复用仍从原文件重新处理。

`node scripts/test-preparation.mjs` 验证预算分配、最终请求接近但小于目标、原文件和顺序保留、取消和编码失败阻止提交。测试使用模拟编码器；实际浏览器 WebP 编码未进行自动化实测。

未添加 @ 语法：Google 官方资料描述的是编号文本与图片 parts 的对应，没有查到原生 @ 图片引用字段。可在后续用户确认后提供站点级 @ 菜单，将其转换为文本图片索引。依据：https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-understanding#best-practices 。

## 独立预览与并发生成（2026-09-15）

修正 Board 的指针捕获时机：图片按下时不捕获，拖动越过 4px 阈值再捕获，保留点击/双击的图片目标。新增独立 Viewer，编辑器由“裁切 / 标注”进入。

TaskQueue 为本页内存队列，最多同时 3 项，任务参数及参考图副本按批次快照。生成期间侧栏保持可用，仅本组参考图准备时短暂锁定。清除 Key 或页面隐藏会取消待执行任务并清除批次内存 Key。完成任务清理批次 Key 与参数；不持久化 Key。等待队列不能在关页后继续运行。

服务端移除旧的单任务唯一索引（追加 Drizzle 0002），用单条 INSERT…SELECT 计数条件原子限制同账号最多 3 个运行任务，跨标签页也生效。超过限制的跨页请求在调用供应商前返回 409，不自动重试。移除 Worker 实例级的两个请求限制。

测试：scripts/test-queue.mjs 覆盖新任务加入、并发上限、排队推进、取消范围、结束后继续提交、双击目标保护；test-workbench 在真实 D1 中并发提交六项，验证只接纳三项并分别返回结果。模拟供应商，无扣费；未进行浏览器交互自动化实测。

Drive 排错：设置中“检查 Drive 连接”只调用 files.list；连接时自动检查。Google 的阶段、HTTP 状态、reason 和脱敏后的 message 会显示在页面，不会保存 token。若 SERVICE_DISABLED/accessNotConfigured，请在创建 OAuth Client ID 的同一 Google Cloud 项目启用 Drive API。

Drive 文件说明：新上传的生成图片使用该图片档案 metadata.prompt 原样填写 Google files.description（包含换行）。没有提示词则不填写。再次上传已归档图片时先校验原图，仅为空说明补写提示词，已有非空说明保留。说明写入失败明确提示原图已在 Drive，可再次点击补写，不重复创建图片。未批量修改现有 Drive 文件。
