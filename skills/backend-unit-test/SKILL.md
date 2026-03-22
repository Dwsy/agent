---
name: backend-unit-test
description: |
  后端单元测试技能。触发场景：
  - 用户要求运行/创建单元测试
  - 用户要求验证数据
  - 用户要求用 Maven 运行测试
  - 关键词：test, maven test, junit, springboot test, 单元测试, 测试验证
  
  核心：不改 pom，用 reactor 模式运行。
---

# 后端单元测试技能

## 执行流程（两步）

```bash
# 步骤1: 编译测试类
cd sfm_back && mvn compiler:testCompile -pl <module> -am

# 步骤2: 运行测试
cd sfm_back && mvn surefire:test -pl <module> -am -Dtest="测试类名"
```

## 参数说明

| 参数 | 作用 |
|------|------|
| `-pl <module>` | 指定模块，如 `med-ams`、`med-bpm-biz` |
| `-am` | 连带构建依赖模块（reactor 模式），不经过 install |
| `-Dtest="xxx"` | 指定测试类，支持通配符 `*` |

## 示例

```bash
# 编译 + 运行 med-ams 模块测试
cd sfm_back && mvn compiler:testCompile -pl med-ams -am
cd sfm_back && mvn surefire:test -pl med-ams -am -Dtest="AmsPropertyReadServiceTest"

# 使用通配符运行多个测试
cd sfm_back && mvn surefire:test -pl med-ams -am -Dtest="AmsPropertyReadService*"

# 运行所有测试
cd sfm_back && mvn surefire:test -pl med-ams -am -Dtest="*Test"
```

## 创建测试文件

```
<module>/src/test/
├── java/com/jp/med/<module>/modules/<功能>/<ServiceTest>.java
└── resources/application.yml
```

```java
package com.jp.med.<module>.modules.<功能>;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("unit-test")
@Transactional
class <ServiceTest> {

    @Autowired(required = false)
    private <Service> targetService;

    @Test
    void contextLoads() {
        assertNotNull(targetService, "服务应该被注入");
    }
}
```

```yaml
# src/test/resources/application.yml
spring:
  main:
    lazy-initialization: true
    banner-mode: off
```

## 数据库

- 本地：`jdbc:postgresql://localhost:5432/jp_db_20260305`
- 测试使用 Nacos 配置的实际数据库连接
- `@Transactional` 确保测试数据自动回滚

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| No tests executed | 测试类未编译 | 先 `compiler:testCompile` |
| 编译失败 | import 错误 | 检查包路径是否与目录匹配 |
| med-common 依赖错误 | clean 后资源被清理 | 避免 clean，直接编译 |
| Test run: 0 | 测试类名不匹配 | 确认类名或使用通配符 `*` |

## 注意事项

- ❌ 不要修改任何 pom.xml
- ❌ 不要执行 `mvn install`
- ❌ 避免 `mvn clean`（触发资源过滤问题）
- ✅ 始终使用 `-am` 参数确保依赖正确构建
- ✅ 先编译再运行，两步走

## 工作流程

1. **查看现有测试**：`find sfm_back -path "*/test/*" -name "*Test.java"`
2. **创建测试文件**（如需要）
3. **编译**：`mvn compiler:testCompile -pl <module> -am`
4. **运行**：`mvn surefire:test -pl <module> -am -Dtest="TestName"`
5. **验证**：`Tests run: X, Failures: 0, Errors: 0`
