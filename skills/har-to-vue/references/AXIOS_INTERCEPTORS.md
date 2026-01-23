# Axios 拦截器配置

## 基础设置

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})
```

## 请求拦截器

### 添加认证 Token

```typescript
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('authToken')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)
```

### 添加请求 ID

```typescript
apiClient.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = crypto.randomUUID()
  return config
})
```

### 添加时间戳

```typescript
apiClient.interceptors.request.use((config) => {
  config.headers['X-Request-Time'] = Date.now().toString()
  return config
})
```

## 响应拦截器

### 统一错误处理

```typescript
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error: AxiosError) => {
    if (error.response) {
      // 服务器返回错误
      switch (error.response.status) {
        case 401:
          // 未授权，跳转登录
          window.location.href = '/login'
          break
        case 403:
          // 禁止访问
          console.error('Access forbidden')
          break
        case 404:
          // 资源不存在
          console.error('Resource not found')
          break
        case 500:
          // 服务器错误
          console.error('Server error')
          break
        default:
          console.error('Request failed:', error.message)
      }
    } else if (error.request) {
      // 请求已发送但无响应
      console.error('No response received')
    } else {
      // 请求配置错误
      console.error('Request config error:', error.message)
    }
    return Promise.reject(error)
  }
)
```

### 自动重试

```typescript
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { _retry?: number }
    const maxRetries = 3

    if (!config._retry && config._retry !== 0) {
      config._retry = 0
    }

    if (config._retry < maxRetries && error.response?.status === 429) {
      config._retry++
      const delay = Math.pow(2, config._retry) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return apiClient(config)
    }

    return Promise.reject(error)
  }
)
```

### 请求/响应日志

```typescript
apiClient.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    console.log(`[Request] ${config.method?.toUpperCase()} ${config.url}`)
  }
  return config
})

apiClient.interceptors.response.use((response) => {
  if (import.meta.env.DEV) {
    console.log(`[Response] ${response.config.url}`, response.data)
  }
  return response
})
```

## 完整示例

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 添加认证
    const token = localStorage.getItem('authToken')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // 添加请求 ID
    config.headers['X-Request-ID'] = crypto.randomUUID()

    // 开发日志
    if (import.meta.env.DEV) {
      console.log(`[Request] ${config.method?.toUpperCase()} ${config.url}`)
    }

    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error: AxiosError) => {
    if (error.response) {
      const { status } = error.response

      switch (status) {
        case 401:
          localStorage.removeItem('authToken')
          window.location.href = '/login'
          break
        case 403:
          console.error('Access forbidden')
          break
        case 404:
          console.error('Resource not found')
          break
        case 500:
          console.error('Server error')
          break
      }
    }

    return Promise.reject(error)
  }
)
```

## 使用示例

```typescript
import { apiClient } from './api/client'

export async function getUsers() {
  return apiClient.get<User[]>('/users')
}

export async function createUser(data: CreateUserRequest) {
  return apiClient.post<User>('/users', data)
}

export async function updateUser(id: number, data: UpdateUserRequest) {
  return apiClient.put<User>(`/users/${id}`, data)
}

export async function deleteUser(id: number) {
  return apiClient.delete(`/users/${id}`)
}
```