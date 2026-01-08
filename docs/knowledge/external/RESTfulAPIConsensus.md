# RESTful API Design Consensus

## Source
[Fielding's Dissertation on REST](https://www.ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)

## Core Principles (核心原则)

### 1. Resource-Based (基于资源)
- 一切皆资源，通过 URI 唯一标识
- 使用名词而非动词：`/users` 而非 `/getUsers`

### 2. Uniform Interface (统一接口)
- 使用标准 HTTP 动词：GET, POST, PUT, DELETE
- 状态码语义化：200, 201, 400, 404, 500

### 3. Stateless (无状态)
- 每个请求包含所有必要信息
- 服务端不保存客户端上下文

### 4. Cacheable (可缓存)
- 响应必须明确标识可缓存性
- 利用 HTTP 缓存头（ETag, Cache-Control）

## Industry Best Practices (行业最佳实践)

### URI Design
```
✅ Good:
GET    /users           # List users
GET    /users/123       # Get specific user
POST   /users           # Create user
PUT    /users/123       # Update user
DELETE /users/123       # Delete user

❌ Bad:
GET    /getUsers
GET    /user
POST   /createUser
GET    /users?type=admin  # Use query params for filtering
```

### Versioning
```
✅ Good: URI versioning
/v1/users
/v2/users

✅ Good: Header versioning
Accept: application/vnd.myapi.v1+json

❌ Bad: No versioning (breaking changes)
```

### Error Responses
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [...]
  }
}
```

## Our Project's Deviations (本项目特殊定制)

- ✅ We follow REST principles
- ⚠️  Deviation: We use RPC-style endpoints for complex operations (`/users/123/actions/resetPassword`)
- Reason: Some operations don't map cleanly to CRUD

## Related Concepts
- [[APIGateway]]
- [[HTTPStatusCodes]]

## References
- [REST API Tutorial](https://restfulapi.net/)
- [Microsoft REST Guidelines](https://github.com/Microsoft/api-guidelines/blob/vNext/Guidelines.md)