# 文书同事学校与专业资料库

网页入口：https://liude-xiaozhan-mp-backend.onrender.com/database

API 基地址：https://liude-xiaozhan-mp-backend.onrender.com/api/catalog/v1

这是公开资料的只读查询入口，不是数据库连接账号。使用现有 HTTPS 443 端口，不需要管理员令牌。接口不提供学生信息、课程管理、修改或删除权限。当前不提供调用方身份识别；如果后续需要公司内部访问控制，应另行设置专用身份认证，而不是分发管理员令牌。

## 请求示例

```javascript
const base = 'https://liude-xiaozhan-mp-backend.onrender.com/api/catalog/v1';
const query = new URLSearchParams({ q: '电气工程', degree: 'Master', page: '1', pageSize: '20' });
const response = await fetch(`${base}/programs?${query}`);
if (!response.ok) throw new Error(`查询失败：${response.status}`);
const data = await response.json();
for (const program of data.records) {
  console.log(program.id, program.schoolName, program.title, program.prerequisites);
}
```

## 路由

- `GET /`：库版本、学校及专业数量、接口目录。
- `GET /schools?q=慕尼黑&page=1&pageSize=20`：学校介绍列表。
- `GET /schools/{id}`：学校详情；`id` 来自列表，不应根据学校名称自行拼接。
- `GET /programs?q=electrical&schoolId=tum`：专业列表。
- `GET /programs/{id}`：专业详情；编号包含非 ASCII 字符时使用 `encodeURIComponent(id)`。

列表公共参数：`q`（不超过200字符）、`city`、`page`（默认1）、`pageSize`（默认20，最大100）。
专业可增加 `schoolId`（精确匹配学校ID）、`degree`（如 Master、Bachelor）、`language`（如 english、german，精确匹配已有标记）。缺失语言标记的项目不会被语言筛选选中，不代表它不提供该语言授课。中文关键词为词表辅助检索，并非全文语义检索；未命中可改用英文名称。

响应字段：`records`、`total`、`page`、`pageSize`、`totalPages`、`datasetVersion`、`notice`。按记录ID排序，可依次翻页读取。学校介绍与专业库覆盖范围不同，`schoolId` 为空意味着尚未建立学校介绍关联，不代表专业不存在。使用 `/programs?q=...` 查询未关联项目。

专业信息包括：`title`、`university`、`schoolName`、`degree`、`city`、`overview`、`prerequisites`、`languageOfInstruction`、`languageRequirements`、`duration`、`ects`、`applicationPeriod`、`applicationDeadline`、`applicationInfo`、`careerInfo`、`tuitionRaw`、`sourceUrls`。未收录字段可能为空。网页对内容去除部分 Markdown 标记，API 保留资料文本。

`tuitionRaw=public` 只是原始分类标记，不能解释为免费；`datasetVersion` 是资料内容哈希，不是核验时间。来源链接可能是采集快照，不应当作实时官网。所有招生条件、语言要求、学费及截止日期均须核对学校当期公告。

错误码：400 参数错误；404 路由或记录不存在；405 不支持写入；500 服务异常。GET 可用于浏览器或服务器调用。不需要也不要传入微信登录令牌或管理令牌。当前服务可能休眠，首次访问需等待唤醒；调用端建议设置30～60秒超时，并对临时失败做少量退避重试。
