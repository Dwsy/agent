# HAR 1.2 规范参考

## 核心结构

```json
{
  "log": {
    "version": "1.2",
    "creator": {},
    "entries": [
      {
        "request": {
          "method": "GET",
          "url": "https://api.example.com/users",
          "headers": [...],
          "queryString": [...],
          "postData": {...}
        },
        "response": {
          "status": 200,
          "headers": [...],
          "content": {
            "mimeType": "application/json",
            "text": "{...}"
          }
        }
      }
    ]
  }
}
```

## 常用字段

### 请求对象 (request)
- `method`: HTTP 方法 (GET, POST, PUT, DELETE)
- `url`: 完整请求 URL
- `headers`: 请求头数组
- `queryString`: URL 查询参数
- `postData`: POST 数据 (JSON, FormData, 等)

### 响应对象 (response)
- `status`: HTTP 状态码
- `headers`: 响应头数组
- `content`: 响应内容
  - `mimeType`: Content-Type
  - `text`: 响应文本
  - `size`: 响应大小

## MIME 类型识别

| MIME 类型 | 处理方式 |
|----------|---------|
| `application/json` | JSON.parse() |
| `text/html` | 文本处理 |
| `application/x-www-form-urlencoded` | URLSearchParams |
| `multipart/form-data` | FormData 解析 |