# Vue 3 Composition API 参考

## 基础响应式

```typescript
import { ref, reactive, computed } from 'vue'

// ref: 基本类型响应式
const count = ref(0)
count.value++

// reactive: 对象响应式
const state = reactive({
  users: [],
  loading: false
})

// computed: 计算属性
const userCount = computed(() => state.users.length)
```

## 数据获取模式

### 基础模式

```typescript
import { ref, onMounted } from 'vue'

const data = ref(null)
const loading = ref(false)
const error = ref(null)

onMounted(async () => {
  loading.value = true
  try {
    data.value = await fetchData()
  } catch (err) {
    error.value = err
  } finally {
    loading.value = false
  }
})
```

### 可复用的 fetch 函数

```typescript
import { ref } from 'vue'

export function useFetch<T>(url: string) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const fetchData = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(response.statusText)
      data.value = await response.json()
    } catch (err) {
      error.value = err as Error
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, fetchData }
}
```

## 生命周期钩子

```typescript
import {
  onMounted,
  onUpdated,
  onUnmounted,
  onBeforeMount,
  onBeforeUpdate,
  onBeforeUnmount
} from 'vue'

onMounted(() => {
  // 组件挂载后
})

onUnmounted(() => {
  // 组件卸载前清理
})
```

## 模板引用

```typescript
import { ref, onMounted } from 'vue'

const inputRef = ref<HTMLInputElement>()

onMounted(() => {
  inputRef.value?.focus()
})
```

## Watchers

```typescript
import { ref, watch, watchEffect } from 'vue'

const count = ref(0)

// watch: 明确的依赖
watch(count, (newValue, oldValue) => {
  console.log(`${oldValue} -> ${newValue}`)
})

// watchEffect: 自动追踪依赖
watchEffect(() => {
  console.log(`Current count: ${count.value}`)
})
```

## Props 和 Emits

```typescript
interface Props {
  userId: number
  title?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  update: [value: string]
  delete: [id: number]
}>()
```