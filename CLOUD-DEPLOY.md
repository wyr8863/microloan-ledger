# 云端部署说明

## 当前方案

项目已经改成标准 Web 服务结构：

- 前端页面：`index.html`、`app.js`、`styles.css`
- 服务端入口：`server.js`
- 容器部署文件：`Dockerfile`
- Render 配置：`render.yaml`

推荐先部署到 Render。

原因：

- 这套系统同时需要网页和 `/api/state` 数据接口
- 需要持久化保存台账数据
- Render 支持 Docker 部署和持久化磁盘，比较适合这种小型内部系统

## 你需要准备

1. 一个 GitHub 仓库
2. 一个 Render 账号
3. 把当前目录代码上传到 GitHub

## 部署步骤

1. 新建 GitHub 仓库，把 `D:\ai` 当前项目推上去
2. 登录 Render
3. 选择 `New +`
4. 选择 `Blueprint`
5. 选择你的 GitHub 仓库
6. Render 会识别 `render.yaml`
7. 确认创建服务
8. 等待构建完成

## 上线后效果

- Render 会分配一个 HTTPS 地址
- 你把这个地址发给公司里其他电脑和手机即可访问
- 所有数据会保存在云端磁盘中，不再依赖你本机开机

## 注意事项

- 目前这套数据存储是单文件 JSON，适合小团队内部使用
- 如果后续多人同时频繁操作，建议下一步升级为 SQLite 或 PostgreSQL
- 如果你需要，我下一步可以继续帮你把数据层升级成数据库版本
