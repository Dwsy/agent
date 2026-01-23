# 常见转换模式

## RESTful API 映射

### 用户管理

| URL | 方法 | 函数名 | 类型 |
|-----|------|--------|------|
| `/api/users` | GET | `getUsers` | `User[]` |
| `/api/users/:id` | GET | `getUser` | `User` |
| `/api/users` | POST | `createUser` | `User` |
| `/api/users/:id` | PUT | `updateUser` | `User` |
| `/api/users/:id` | DELETE | `deleteUser` | `void` |

### 资源列表

```typescript
// HAR: GET /api/products?page=1&limit=20
export async function getProducts(params: GetProductsParams): Promise<ProductsResponse> {
  const { page, limit } = params
  return axios.get('/api/products', { params: { page, limit } })
}
```

## 数据结构推断

### 嵌套对象

```json
{
  "user": {
    "id": 1,
    "name": "John",
    "profile": {
      "age": 30,
      "address": {
        "city": "NYC"
      }
    }
  }
}
```

```typescript
export interface UserResponse {
  user: {
    id: number
    name: string
    profile: {
      age: number
      address: {
        city: string
      }
    }
  }
}
```

### 数组类型

```json
{
  "users": [
    { "id": 1, "name": "John" },
    { "id": 2, "name": "Jane" }
  ]
}
```

```typescript
export interface UsersResponse {
  users: User[]
}

export interface User {
  id: number
  name: string
}
```

### 分页响应

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

```typescript
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
```

## 组件模板生成

### 表格组件

```vue
<template>
  <table v-if="users.length">
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Email</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="user in users" :key="user.id">
        <td>{{ user.id }}</td>
        <td>{{ user.name }}</td>
        <td>{{ user.email }}</td>
      </tr>
    </tbody>
  </table>
</template>
```

### 卡片列表

```vue
<template>
  <div class="card-list">
    <div v-for="product in products" :key="product.id" class="card">
      <img :src="product.image" :alt="product.name" />
      <h3>{{ product.name }}</h3>
      <p>{{ product.description }}</p>
      <span class="price">{{ product.price }}</span>
    </div>
  </div>
</template>
```

### 加载状态

```vue
<template>
  <div v-if="loading" class="loading">Loading...</div>
  <div v-else-if="error" class="error">{{ error.message }}</div>
  <div v-else>
    <!-- 内容 -->
  </div>
</template>
```

## API 服务组织

### 按资源分组

```
api/
├── index.ts          # 导出所有
├── users.ts          # 用户 API
├── products.ts       # 产品 API
├── orders.ts         # 订单 API
└── client.ts         # Axios 实例
```

### client.ts 模板

```typescript
import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // 处理未授权
    }
    return Promise.reject(error)
  }
)
```

## 类型定义优化

### 提取通用类型

```typescript
// 通用响应包装
export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

// 分页参数
export interface PaginationParams {
  page: number
  pageSize: number
}

// 排序参数
export interface SortParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}
```

### 组合类型

```typescript
export interface UserListParams extends PaginationParams, SortParams {
  keyword?: string
  status?: 'active' | 'inactive'
}
```