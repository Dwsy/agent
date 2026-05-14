---
name: refactoring-guide
description: 重构指南 - 66种重构技术的中文参考手册。当用户需要重构代码、优化代码结构、消除代码异味(code smells)、改善代码可读性时使用。触发词：重构、refactor、代码优化、代码异味、code smell、提取函数、内联、搬移函数、简化条件、整理继承。基于 Refactoring.Guru 的权威内容。
---

# 重构指南

基于 Refactoring.Guru 的 66 种重构技术中文参考手册。

## 使用方式

当用户提出重构需求时：

1. **识别问题** - 通过决策树定位代码问题
2. **选择技术** - 根据决策树选择对应的重构手法
3. **执行重构** - 按步骤实施，每步后测试

---

## 总体决策路由

```mermaid
flowchart TD
    Start[代码需要重构] --> Q1{问题出在哪里？}
    
    Q1 -->|函数| CAT1[组合函数]
    Q1 -->|类之间| CAT2[搬移特性]
    Q1 -->|数据| CAT3[组织数据]
    Q1 -->|条件逻辑| CAT4[简化条件]
    Q1 -->|函数调用| CAT5[简化调用]
    Q1 -->|继承| CAT6[处理泛化]
    
    CAT1 --> R1[→ 组合函数决策树]
    CAT2 --> R2[→ 搬移特性决策树]
    CAT3 --> R3[→ 组织数据决策树]
    CAT4 --> R4[→ 简化条件决策树]
    CAT5 --> R5[→ 简化调用决策树]
    CAT6 --> R6[→ 处理泛化决策树]
    
    style Start fill:#e1f5fe
    style CAT1 fill:#fff3e0
    style CAT2 fill:#fff3e0
    style CAT3 fill:#fff3e0
    style CAT4 fill:#fff3e0
    style CAT5 fill:#fff3e0
    style CAT6 fill:#fff3e0
```

---

## 1. 组合函数决策树

```mermaid
flowchart TD
    Start[函数问题] --> Q1{函数太长？}
    
    Q1 -->|是| Q2{有可独立的代码片段？}
    Q2 -->|是| A1[提取函数<br/>Extract Method]
    Q2 -->|否| Q3{局部变量太多？}
    Q3 -->|是| A2[以函数对象取代函数<br/>Replace Method with Method Object]
    Q3 -->|否| Q4{临时变量被多次赋值？}
    Q4 -->|是| A3[分解临时变量<br/>Split Temporary Variable]
    
    Q1 -->|否| Q5{函数体比名字更清晰？}
    Q5 -->|是| A4[内联函数<br/>Inline Method]
    Q5 -->|否| Q6{表达式难以理解？}
    Q6 -->|是| Q7{是临时变量？}
    Q7 -->|是| A5[提取变量<br/>Extract Variable]
    Q7 -->|否| A6[以查询取代临时变量<br/>Replace Temp with Query]
    
    Q6 -->|否| Q8{函数修改了参数？}
    Q8 -->|是| A7[移除对参数的赋值<br/>Remove Assignments to Parameters]
    Q8 -->|否| Q9{有更清晰的算法？}
    Q9 -->|是| A8[替换算法<br/>Substitute Algorithm]
    Q9 -->|否| A9[内联临时变量<br/>Inline Temp]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
    style A8 fill:#c8e6c9
    style A9 fill:#c8e6c9
```

---

## 2. 搬移特性决策树

```mermaid
flowchart TD
    Start[类之间职责分配] --> Q1{函数在哪个类用得多？}
    
    Q1 -->|另一个类| A1[搬移函数<br/>Move Method]
    Q1 -->|当前类| Q2{字段在哪个类用得多？}
    
    Q2 -->|另一个类| A2[搬移字段<br/>Move Field]
    Q2 -->|当前类| Q3{一个类做了太多事？}
    
    Q3 -->|是| A3[提炼类<br/>Extract Class]
    Q3 -->|否| Q4{类职责太少？}
    
    Q4 -->|是| A4[将类内联化<br/>Inline Class]
    Q4 -->|否| Q5{客户端直接访问受托类？}
    
    Q5 -->|是| A5[隐藏委托关系<br/>Hide Delegate]
    Q5 -->|否| Q6{中间人转发过多？}
    
    Q6 -->|是| A6[移除中间人<br/>Remove Middle Man]
    Q6 -->|否| Q7{需要给外部类加方法？}
    
    Q7 -->|一个方法| A7[引入外加函数<br/>Introduce Foreign Method]
    Q7 -->|多个方法| A8[引入本地扩展<br/>Introduce Local Extension]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
    style A8 fill:#c8e6c9
```

---

## 3. 组织数据决策树

```mermaid
flowchart TD
    Start[数据组织问题] --> Q1{数据类型？}
    
    Q1 -->|字段| Q2{字段是公有的？}
    Q2 -->|是| A1[封装字段<br/>Encapsulate Field]
    Q2 -->|否| Q3{子类需要通过getter访问？}
    Q3 -->|是| A2[自封装字段<br/>Self Encapsulate Field]
    
    Q1 -->|数据值| Q4{需要额外行为？}
    Q4 -->|是| A3[以对象取代数据值<br/>Replace Data Value with Object]
    Q4 -->|否| Q5{有神秘数字？}
    Q5 -->|是| A4[以字面常量取代魔法数<br/>Replace Magic Number]
    
    Q1 -->|集合| Q6{getter返回集合引用？}
    Q6 -->|是| A5[封装集合<br/>Encapsulate Collection]
    
    Q1 -->|类型码| Q7{类型码影响行为？}
    Q7 -->|否| A6[以类取代类型码<br/>Replace Type Code with Class]
    Q7 -->|是| Q8{能用继承？}
    Q8 -->|是| A7[以子类取代类型码<br/>Replace Type Code with Subclasses]
    Q8 -->|否| A8[以State/Strategy取代类型码]
    
    Q1 -->|引用/值| Q9{对象身份重要？}
    Q9 -->|是| A9[将值对象改为引用对象]
    Q9 -->|否| A10[将引用对象改为值对象]
    
    Q1 -->|数组| Q10{元素代表不同东西？}
    Q10 -->|是| A11[以对象取代数组<br/>Replace Array with Object]
    
    Q1 -->|子类| Q11{子类仅返回常量？}
    Q11 -->|是| A12[以字段取代子类<br/>Replace Subclass with Fields]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
    style A8 fill:#c8e6c9
    style A9 fill:#c8e6c9
    style A10 fill:#c8e6c9
    style A11 fill:#c8e6c9
    style A12 fill:#c8e6c9
```

---

## 4. 简化条件决策树

```mermaid
flowchart TD
    Start[条件逻辑问题] --> Q1{条件类型？}
    
    Q1 -->|复杂if/else| Q2{分支逻辑独立？}
    Q2 -->|是| A1[分解条件表达式<br/>Decompose Conditional]
    Q2 -->|否| Q3{深层嵌套？}
    Q3 -->|是| A2[以卫语句取代嵌套条件<br/>Guard Clauses]
    
    Q1 -->|多个条件同结果| A3[合并条件表达式<br/>Consolidate Conditional]
    
    Q1 -->|条件分支有重复| A4[合并重复的条件片段<br/>Consolidate Duplicate]
    
    Q1 -->|布尔控制标记| A5[移除控制标记<br/>Remove Control Flag]
    
    Q1 -->|根据类型选择行为| Q4{能用继承？}
    Q4 -->|是| A6[以多态取代条件<br/>Polymorphism]
    Q4 -->|否| A7[以State/Strategy取代]
    
    Q1 -->|频繁检查null| A8[引入Null对象<br/>Introduce Null Object]
    
    Q1 -->|代码有假设条件| A9[引入断言<br/>Introduce Assertion]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
    style A8 fill:#c8e6c9
    style A9 fill:#c8e6c9
```

---

## 5. 简化调用决策树

```mermaid
flowchart TD
    Start[函数调用问题] --> Q1{问题类型？}
    
    Q1 -->|命名| A1[函数改名<br/>Rename Method]
    
    Q1 -->|参数| Q2{参数问题？}
    Q2 -->|需要更多参数| A2[添加参数<br/>Add Parameter]
    Q2 -->|参数不再使用| A3[移除参数<br/>Remove Parameter]
    Q2 -->|参数总是一起出现| A4[引入参数对象<br/>Introduce Parameter Object]
    Q2 -->|参数可通过函数获得| A5[以函数取代参数]
    Q2 -->|从对象提取多个值传参| A6[保持对象完整<br/>Preserve Whole Object]
    Q2 -->|参数决定行为| Q3{多个函数逻辑相似？}
    Q3 -->|是| A7[令函数携带参数<br/>Parameterize Method]
    Q3 -->|否| A8[以明确函数取代参数]
    
    Q1 -->|职责不清| Q4{具体问题？}
    Q4 -->|既查询又修改| A9[将查询和修改分离<br/>Separate Query from Modifier]
    Q4 -->|函数未被使用| A10[隐藏函数<br/>Hide Method]
    
    Q1 -->|构造/工厂| Q5{需要根据类型创建？}
    Q5 -->|是| A11[以工厂函数取代构造函数]
    
    Q1 -->|错误处理| Q6{错误处理方式？}
    Q6 -->|返回错误码| A12[以异常取代错误码]
    Q6 -->|异常用于条件检查| A13[以测试取代异常]
    
    Q1 -->|setter| Q7{字段创建后不应改变？}
    Q7 -->|是| A14[移除设值函数<br/>Remove Setting Method]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
    style A8 fill:#c8e6c9
    style A9 fill:#c8e6c9
    style A10 fill:#c8e6c9
    style A11 fill:#c8e6c9
    style A12 fill:#c8e6c9
    style A13 fill:#c8e6c9
    style A14 fill:#c8e6c9
```

---

## 6. 处理泛化决策树

```mermaid
flowchart TD
    Start[继承体系问题] --> Q1{问题方向？}
    
    Q1 -->|向上移动| Q2{移动什么？}
    Q2 -->|字段| A1[字段上移<br/>Pull Up Field]
    Q2 -->|函数| A2[函数上移<br/>Pull Up Method]
    Q2 -->|构造函数| A3[构造函数本体上移<br/>Pull Up Constructor Body]
    
    Q1 -->|向下移动| Q4{移动什么？}
    Q4 -->|函数| A4[函数下移<br/>Push Down Method]
    Q4 -->|字段| A5[字段下移<br/>Push Down Field]
    
    Q1 -->|提取| Q5{提取什么？}
    Q5 -->|子类| A6[提炼子类<br/>Extract Subclass]
    Q5 -->|超类| A7[提炼超类<br/>Extract Superclass]
    Q5 -->|接口| A8[提炼接口<br/>Extract Interface]
    
    Q1 -->|合并| Q6{超类子类区别大？}
    Q6 -->|否| A9[折叠继承体系<br/>Collapse Hierarchy]
    
    Q1 -->|模板| Q7{子类有相似步骤？}
    Q7 -->|是| A10[塑造模板函数<br/>Form Template Method]
    
    Q1 -->|委托vs继承| Q8{当前方式？}
    Q8 -->|继承，只用部分功能| A11[以委托取代继承]
    Q8 -->|委托，过于简单| A12[以继承取代委托]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
    style A8 fill:#c8e6c9
    style A9 fill:#c8e6c9
    style A10 fill:#c8e6c9
    style A11 fill:#c8e6c9
    style A12 fill:#c8e6c9
```

---

## 代码异味速查

```mermaid
flowchart LR
    Smells[代码异味] --> B[臃肿者<br/>Bloaters]
    Smells --> OO[面向对象滥用<br/>OO Abusers]
    Smells --> CP[变更阻止者<br/>Change Preventers]
    Smells --> D[冗余物<br/>Dispensables]
    Smells --> C[耦合器<br/>Couplers]
    
    B --> B1[过长函数]
    B --> B2[过大的类]
    B --> B3[基本类型偏执]
    B --> B4[过长参数列表]
    B --> B5[数据泥团]
    
    OO --> OO1[switch语句]
    OO --> OO2[临时字段]
    OO --> OO3[被拒绝的遗赠]
    OO --> OO4[异曲同工的类]
    
    CP --> CP1[发散式变化]
    CP --> CP2[散弹式修改]
    CP --> CP3[平行继承体系]
    
    D --> D1[注释]
    D --> D2[重复代码]
    D --> D3[冗余类]
    D --> D4[数据类]
    D --> D5[死代码]
    
    C --> C1[特性依恋]
    C --> C2[不当亲密]
    C --> C3[消息链]
    C --> C4[中间人]
    
    style Smells fill:#ffcdd2
    style B fill:#fff9c4
    style OO fill:#fff9c4
    style CP fill:#fff9c4
    style D fill:#fff9c4
    style C fill:#fff9c4
```

---

## 详细参考

每个分类的详细重构步骤请参考：
- `references/composing-methods.md` - 组合函数
- `references/moving-features.md` - 搬移特性
- `references/organizing-data.md` - 组织数据
- `references/simplifying-conditionals.md` - 简化条件
- `references/simplifying-method-calls.md` - 简化调用
- `references/dealing-with-generalization.md` - 处理泛化

## 重构原则

1. **小步前进** - 每次只做一个小改动
2. **频繁测试** - 每步之后运行测试
3. **保持可运行** - 代码在重构过程中始终可以运行
4. **可回滚** - 使用版本控制，随时可以撤销
