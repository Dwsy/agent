# TypeScript 类型推断规则

## 基本类型映射

| JSON 值 | TypeScript 类型 |
|---------|----------------|
| `null` | `null` |
| `true` / `false` | `boolean` |
| `42` | `number` |
| `"text"` | `string` |
| `[...]` | `T[]` |
| `{...}` | 接口类型 |

## 接口命名规范

- 响应类型: `{FunctionName}Response`
- 请求类型: `{FunctionName}Request`
- 参数类型: `{FunctionName}Params`
- 数据类型: `{Resource}` (如 `User`, `Product`)

```typescript
export interface GetUserResponse {
  id: number
  name: string
}

export interface CreateUserRequest {
  name: string
  email: string
}

export interface GetUserParams {
  id: number
  include?: string[]
}
```

## 可选字段处理

规则: 如果值为 `null` 或在样本中缺失，标记为可选

```typescript
// 输入
{
  "id": 1,
  "name": "John",
  "email": null,
  "phone": "123456"
}

// 输出
export interface Data {
  id: number
  name: string
  email?: string | null
  phone: string
}
```

## 数组类型推断

```typescript
// 输入
{
  "users": [
    { "id": 1, "name": "John" },
    { "id": 2, "name": "Jane" }
  ]
}

// 输出
export interface User {
  id: number
  name: string
}

export interface Response {
  users: User[]
}
```

## 联合类型

```typescript
// 输入
{
  "status": "active",  // 可能是 "active", "inactive", "pending"
  "role": "admin"      // 可能是 "admin", "user", "guest"
}

// 输出 (需要手动指定或从多个样本推断)
export interface Response {
  status: 'active' | 'inactive' | 'pending'
  role: 'admin' | 'user' | 'guest'
}
```

## 日期处理

```typescript
// 检测日期字段
{
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-02T00:00:00Z"
}

// 输出
export interface Data {
  createdAt: string  // 或 Date
  updatedAt: string  // 或 Date
}
```

## 深度嵌套

```typescript
// 输入
{
  "user": {
    "profile": {
      "address": {
        "city": "NYC",
        "country": "USA"
      }
    }
  }
}

// 输出
export interface Data {
  user: {
    profile: {
      address: {
        city: string
        country: string
      }
    }
  }
}
```

## 泛型类型

```typescript
// 分页响应
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
}

// API 响应包装
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}
```

## 类型保护

```typescript
export function isUser(obj: any): obj is User {
  return (
    typeof obj?.id === 'number' &&
    typeof obj?.name === 'string'
  )
}
```