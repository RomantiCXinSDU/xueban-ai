# 学伴AI API文档

> **版本**: v1.1.0  
> **基础路径**: `http://localhost:3000/api`

---

## 目录

1. [认证接口](#认证接口)
2. [AI对话接口](#AI对话接口)
3. [题目处理接口](#题目处理接口)
4. [学习计划接口](#学习计划接口)
5. [健康检查](#健康检查)

---

## 认证接口

### 注册

**POST** `/api/auth/register`

请求体：
```json
{
  "username": "string (必填)",
  "password": "string (必填)",
  "email": "string (可选)"
}
```

响应：
```json
{
  "success": true,
  "message": "注册成功",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "createdAt": "timestamp"
  }
}
```

### 登录

**POST** `/api/auth/login`

请求体：
```json
{
  "username": "string (必填)",
  "password": "string (必填)"
}
```

响应：
```json
{
  "success": true,
  "message": "登录成功",
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "username": "string"
  }
}
```

### 获取用户信息

**GET** `/api/auth/me`

请求头：`Authorization: Bearer <token>`

响应：
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "createdAt": "timestamp"
  }
}
```

---

## AI对话接口

### 聊天

**POST** `/api/ai/chat`

请求体：
```json
{
  "message": "string (必填，最大2000字符)",
  "conversationId": "string (可选，用于多轮对话)"
}
```

响应：
```json
{
  "success": true,
  "response": "string (AI回复内容)",
  "questionType": "string (题目类型)",
  "model": "string (使用的模型)",
  "conversationId": "string"
}
```

### 内容总结

**POST** `/api/ai/summarize`

请求体：
```json
{
  "content": "string (必填，最大5000字符)",
  "subject": "string (可选，学科名称)"
}
```

响应：
```json
{
  "success": true,
  "summary": "string (总结内容)",
  "model": "string"
}
```

### 题型分析

**POST** `/api/ai/analyze-question`

请求体：
```json
{
  "question": "string (必填)"
}
```

响应：
```json
{
  "success": true,
  "analysis": {
    "type": "string",
    "category": "string",
    "difficulty": "number (1-5)",
    "knowledgePoints": ["string"],
    "solutionStrategy": "string",
    "similarExamples": ["string"],
    "relatedTopics": ["string"]
  }
}
```

### 生成学习计划

**POST** `/api/ai/generate-plan`

请求体：
```json
{
  "subject": "string (必填)",
  "goal": "string (必填)",
  "duration": "number (必填，1-365)",
  "dailyHours": "number (可选，默认2)",
  "currentLevel": "string (可选，默认中等)"
}
```

响应：
```json
{
  "success": true,
  "plan": {
    "summary": "string",
    "phases": [
      {"name": "string", "days": "string", "focus": "string"}
    ],
    "dailySchedule": [
      {"day": "number", "topic": "string", "objectives": ["string"], "estimatedHours": "number"}
    ],
    "milestones": [
      {"day": "number", "milestone": "string", "assessment": "string"}
    ],
    "tips": ["string"]
  }
}
```

---

## 题目处理接口

### 解题

**POST** `/api/problem/solve`

请求体：
```json
{
  "question": "string (题目文字描述)",
  "imageData": "string (base64图片数据)",
  "ocrText": "string (OCR识别结果)"
}
```

响应：
```json
{
  "success": true,
  "questionType": "string",
  "solution": {
    "knowledgePoints": ["string"],
    "solutionStrategy": "string",
    "similarExamples": ["string"],
    "commonMistakes": ["string"]
  },
  "model": "string"
}
```

### 题型分析

**POST** `/api/problem/analyze`

请求体：
```json
{
  "question": "string (必填)"
}
```

响应：
```json
{
  "success": true,
  "analysis": {
    "type": "string",
    "category": "string",
    "difficulty": "number",
    "knowledgePoints": ["string"],
    "solutionStrategy": "string",
    "similarExamples": ["string"],
    "relatedTopics": ["string"]
  }
}
```

### OCR识别

**POST** `/api/problem/ocr`

请求体：
```json
{
  "imageData": "string (base64图片数据，必填)"
}
```

响应：
```json
{
  "success": true,
  "text": "string (识别文字)",
  "confidence": "number (置信度)",
  "message": "string (提示信息)"
}
```

### 获取解题历史

**GET** `/api/problem/history`

响应：
```json
{
  "success": true,
  "history": [
    {
      "id": "uuid",
      "question": "string",
      "questionType": "string",
      "solution": "object",
      "solvedAt": "timestamp"
    }
  ]
}
```

---

### 错题本接口

#### 添加错题

**POST** `/api/problem/wrong`

请求体：
```json
{
  "question": "string (必填)",
  "wrongAnswer": "string (可选)",
  "correctAnswer": "string (可选)",
  "analysis": "string (可选)",
  "category": "string (可选)"
}
```

响应：
```json
{
  "success": true,
  "message": "错题添加成功",
  "wrongProblem": {
    "id": "uuid",
    "question": "string",
    "category": "string",
    "createdAt": "timestamp",
    "reviewed": false
  }
}
```

#### 获取错题列表

**GET** `/api/problem/wrong`

查询参数：
- `category`: string (按科目筛选)
- `reviewed`: boolean (是否已复习)

响应：
```json
{
  "success": true,
  "wrongProblems": [
    {
      "id": "uuid",
      "question": "string",
      "wrongAnswer": "string",
      "correctAnswer": "string",
      "analysis": "string",
      "category": "string",
      "reviewed": "boolean",
      "createdAt": "timestamp"
    }
  ]
}
```

#### 标记已复习

**PUT** `/api/problem/wrong/:id/review`

响应：
```json
{
  "success": true,
  "message": "已标记为已复习",
  "wrongProblem": {
    "id": "uuid",
    "reviewed": true,
    "reviewedAt": "timestamp"
  }
}
```

#### 删除错题

**DELETE** `/api/problem/wrong/:id`

响应：
```json
{
  "success": true,
  "message": "错题删除成功"
}
```

---

## 学习计划接口

### 获取学习计划列表

**GET** `/api/study/plans`

响应：
```json
{
  "success": true,
  "plans": [
    {
      "id": "uuid",
      "subject": "string",
      "goal": "string",
      "duration": "number",
      "dailyHours": "number",
      "createdAt": "timestamp",
      "status": "string"
    }
  ]
}
```

### 创建学习计划

**POST** `/api/study/plans`

请求体：
```json
{
  "subject": "string (必填)",
  "goal": "string (必填)",
  "duration": "number (必填)",
  "dailyHours": "number (可选)"
}
```

响应：
```json
{
  "success": true,
  "message": "学习计划创建成功",
  "plan": {
    "id": "uuid",
    "subject": "string",
    "goal": "string",
    "duration": "number",
    "dailyHours": "number",
    "schedule": [{"day": "number", "topic": "string", "completed": "boolean"}]
  }
}
```

### 获取学习计划详情

**GET** `/api/study/plans/:id`

响应：
```json
{
  "success": true,
  "plan": {
    "id": "uuid",
    "subject": "string",
    "goal": "string",
    "duration": "number",
    "dailyHours": "number",
    "schedule": [{"day": "number", "topic": "string", "completed": "boolean"}],
    "progress": ["object"]
  }
}
```

### 更新学习计划

**PUT** `/api/study/plans/:id`

请求体：
```json
{
  "subject": "string",
  "goal": "string",
  "duration": "number",
  "status": "string"
}
```

响应：
```json
{
  "success": true,
  "message": "学习计划更新成功",
  "plan": "object"
}
```

### 删除学习计划

**DELETE** `/api/study/plans/:id`

响应：
```json
{
  "success": true,
  "message": "学习计划删除成功"
}
```

### 获取学习进度

**GET** `/api/study/progress`

响应：
```json
{
  "success": true,
  "progress": [
    {
      "planId": "uuid",
      "completedDays": "number",
      "progress": "number (百分比)",
      "updatedAt": "timestamp"
    }
  ]
}
```

### 更新学习进度

**POST** `/api/study/progress`

请求体：
```json
{
  "planId": "string (必填)",
  "day": "number (必填)",
  "completed": "boolean (必填)",
  "notes": "string (可选)"
}
```

响应：
```json
{
  "success": true,
  "message": "进度更新成功",
  "progress": {
    "planId": "string",
    "day": "number",
    "completed": "boolean",
    "overallProgress": "number",
    "totalDays": "number",
    "completedDays": "number"
  }
}
```

### 获取学习资料

**GET** `/api/study/materials`

响应：
```json
{
  "success": true,
  "materials": [
    {
      "id": "uuid",
      "title": "string",
      "type": "string",
      "url": "string",
      "notes": "string",
      "createdAt": "timestamp"
    }
  ]
}
```

### 添加学习资料

**POST** `/api/study/materials`

请求体：
```json
{
  "title": "string (必填)",
  "type": "string (可选)",
  "url": "string (可选)",
  "notes": "string (可选)"
}
```

响应：
```json
{
  "success": true,
  "message": "学习资料添加成功",
  "material": {
    "id": "uuid",
    "title": "string",
    "type": "string",
    "createdAt": "timestamp"
  }
}
```

---

## 健康检查

### 健康状态

**GET** `/health`

响应：
```json
{
  "status": "ok",
  "uptime": "number (秒)",
  "timestamp": "ISO timestamp",
  "aiEnabled": "boolean",
  "version": "string"
}
```

---

## 错误响应格式

```json
{
  "success": false,
  "error": "string (错误信息)"
}
```

---

## 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 使用示例

### cURL

```bash
# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "123456"}'

# AI聊天
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "什么是微积分？"}'

# 解题
curl -X POST http://localhost:3000/api/problem/solve \
  -H "Content-Type: application/json" \
  -d '{"question": "求解方程 x² + 2x - 3 = 0"}'

# 生成学习计划
curl -X POST http://localhost:3000/api/ai/generate-plan \
  -H "Content-Type: application/json" \
  -d '{"subject": "math", "goal": "期末复习", "duration": 7}'
```

---

## 注意事项

1. 所有请求需要设置 `Content-Type: application/json`
2. 认证接口返回的token需要在后续请求的 `Authorization` 头中携带
3. 未配置AI API Key时使用fallback模式返回模板数据
4. 文件上传大小限制为10MB
5. 请求频率限制：100次/15分钟

---

*文档版本: v1.1.0*  
*最后更新: 20