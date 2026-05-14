---
name: design-patterns-guide
description: 设计模式指南 - 22种经典设计模式的中文参考手册。当用户需要选择合适的设计模式、改善代码架构、解决对象创建/组合/通信问题时使用。触发词：设计模式、design pattern、工厂模式、单例、观察者、策略模式、适配器、代理、装饰器、架构设计。基于 Refactoring.Guru 的权威内容。
---

# 设计模式指南

基于 Refactoring.Guru 的 22 种经典设计模式中文参考手册。

## 使用方式

1. **识别问题类型** - 通过总体路由定位问题领域
2. **选择模式** - 通过决策树选择合适的设计模式
3. **参考实现** - 查看详细文档和代码示例

---

## 总体决策路由

```mermaid
flowchart TD
    Start[需要设计模式] --> Q1{核心问题是什么？}
    
    Q1 -->|对象创建| CAT1[创建型模式]
    Q1 -->|对象组合/结构| CAT2[结构型模式]
    Q1 -->|对象通信/行为| CAT3[行为模式]
    
    CAT1 --> Q2{创建方面的具体问题？}
    Q2 -->|不想暴露具体类| T1[工厂方法]
    Q2 -->|创建相关对象族| T2[抽象工厂]
    Q2 -->|分步构建复杂对象| T3[生成器]
    Q2 -->|复制现有对象| T4[原型]
    Q2 -->|全局唯一实例| T5[单例]
    
    CAT2 --> Q3{结构方面的具体问题？}
    Q3 -->|接口不兼容| T6[适配器]
    Q3 -->|分离抽象与实现| T7[桥接]
    Q3 -->|树形结构| T8[组合]
    Q3 -->|动态添加功能| T9[装饰]
    Q3 -->|简化复杂子系统| T10[外观]
    Q3 -->|大量相似对象| T11[享元]
    Q3 -->|控制对象访问| T12[代理]
    
    CAT3 --> Q4{行为方面的具体问题？}
    Q4 -->|请求的发送者与接收者解耦| Q5{具体需求？}
    Q5 -->|多个对象依次处理| T13[责任链]
    Q5 -->|将请求封装为对象| T14[命令]
    
    Q4 -->|遍历集合| T15[迭代器]
    Q4 -->|对象间通信| Q6{具体需求？}
    Q6 -->|通过中介者通信| T16[中介者]
    Q6 -->|状态变化通知| T17[观察者]
    
    Q4 -->|对象状态管理| Q7{具体需求？}
    Q7 -->|状态改变行为| T18[状态]
    Q7 -->|保存/恢复状态| T19[备忘录]
    
    Q4 -->|算法/行为选择| Q8{具体需求？}
    Q8 -->|运行时切换算法| T20[策略]
    Q8 -->|定义算法骨架| T21[模板方法]
    
    Q4 -->|对不同类型的统一操作| T22[访问者]
    
    style Start fill:#e1f5fe
    style CAT1 fill:#fff3e0
    style CAT2 fill:#e8f5e9
    style CAT3 fill:#fce4ec
```

---

## 创建型模式决策树

```mermaid
flowchart TD
    Start[对象创建问题] --> Q1{问题是什么？}
    
    Q1 -->|不知道具体要创建哪个类| Q2{需要创建一族相关对象？}
    Q2 -->|是| A1[抽象工厂<br/>Abstract Factory]
    Q2 -->|否| A2[工厂方法<br/>Factory Method]
    
    Q1 -->|对象构建过程复杂| Q3{需要分步构建？}
    Q3 -->|是| A3[生成器<br/>Builder]
    Q3 -->|否| Q4{需要多种表示？}
    Q4 -->|是| A3
    Q4 -->|否| A2
    
    Q1 -->|需要复制对象| Q5{对象结构复杂？}
    Q5 -->|是| A4[原型<br/>Prototype]
    Q5 -->|否| 直接new
    
    Q1 -->|需要唯一实例| Q6{需要延迟初始化？}
    Q6 -->|是| A5[单例<br/>Singleton]
    Q6 -->|否| A5
    
    A1 --> |使用场景| U1[跨平台UI组件<br/>数据库访问层]
    A2 --> |使用场景| U2[框架扩展点<br/>解耦创建逻辑]
    A3 --> |使用场景| U3[复杂对象构建<br/>多步骤配置]
    A4 --> |使用场景| U4[避免昂贵的初始化<br/>运行时配置复制]
    A5 --> |使用场景| U5[配置管理器<br/>日志记录器<br/>连接池]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
```

---

## 结构型模式决策树

```mermaid
flowchart TD
    Start[对象组合问题] --> Q1{核心问题？}
    
    Q1 -->|接口不兼容| Q2{能修改目标类？}
    Q2 -->|不能| A1[适配器<br/>Adapter]
    Q2 -->|能| 直接修改接口
    
    Q1 -->|抽象与实现紧耦合| A2[桥接<br/>Bridge]
    
    Q1 -->|树形结构| A3[组合<br/>Composite]
    
    Q1 -->|需要扩展功能| Q3{能否用继承？}
    Q3 -->|继承不灵活| A4[装饰<br/>Decorator]
    Q3 -->|需要代理控制| A5[代理<br/>Proxy]
    
    Q1 -->|子系统太复杂| A6[外观<br/>Facade]
    
    Q1 -->|大量相似对象| Q4{对象状态可共享？}
    Q4 -->|是| A7[享元<br/>Flyweight]
    Q4 -->|否| 考虑其他方案
    
    A1 --> |使用场景| U1[旧系统集成<br/>第三方库适配]
    A2 --> |使用场景| U2[跨平台渲染<br/>数据库驱动切换]
    A3 --> |使用场景| U3[文件系统<br/>GUI组件树<br/>组织架构]
    A4 --> |使用场景| U4[日志/缓存/权限<br/>动态添加职责]
    A5 --> |使用场景| U5[延迟加载<br/>访问控制<br/>缓存代理]
    A6 --> |使用场景| U6[简化复杂API<br/>子系统入口]
    A7 --> |使用场景| U7[字符渲染<br/>粒子系统<br/>连接池]
    
    style A1 fill:#c8e6c9
    style A2 fill:#c8e6c9
    style A3 fill:#c8e6c9
    style A4 fill:#c8e6c9
    style A5 fill:#c8e6c9
    style A6 fill:#c8e6c9
    style A7 fill:#c8e6c9
```

---

## 行为模式决策树

```mermaid
flowchart TD
    Start[对象通信/行为问题] --> Q1{核心问题？}
    
    Q1 -->|请求处理| Q2{处理方式？}
    Q2 -->|多个对象依次处理| A1[责任链<br/>Chain of Responsibility]
    Q2 -->|封装请求为对象| A2[命令<br/>Command]
    
    Q1 -->|遍历集合| A3[迭代器<br/>Iterator]
    
    Q1 -->|对象间通信| Q3{通信方式？}
    Q3 -->|一对多通知| A4[观察者<br/>Observer]
    Q3 -->|多对多解耦| A5[中介者<br/>Mediator]
    
    Q1 -->|状态管理| Q4{具体需求？}
    Q4 -->|状态改变行为| A6[状态<br/>State]
    Q4 -->|保存/恢复状态| A7[备忘录<br/>Memento]
    
    Q1 -->|算法选择| Q5{选择时机？}
    Q5 -->|运行时切换| A8[策略<br/>Strategy]
    Q5 -->|编译时定义骨架| A9[模板方法<br/>Template Method]
    
    Q1 -->|统一操作多种类型| A10[访问者<br/>Visitor]
    
    A1 --> |使用场景| U1[审批流程<br/>事件冒泡]
    A2 --> |使用场景| U2[撤销/重做<br/>任务队列<br/>宏命令]
    A3 --> |使用场景| U3[集合遍历<br/>流式处理]
    A4 --> |使用场景| U4[事件系统<br/>MVC数据绑定]
    A5 --> |使用场景| U5[聊天室<br/>表单组件协调]
    A6 --> |使用场景| U6[订单状态<br/>TCP连接状态]
    A7 --> |使用场景| U7[游戏存档<br/>事务回滚]
    A8 --> |使用场景| U8[排序算法切换<br/>支付方式选择]
    A9 --> |使用场景| U9[框架钩子<br/>算法步骤固定]
    A10 --> |使用场景| U10[编译器AST<br/>文档导出]
    
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
```

---

## 模式关系图

```mermaid
flowchart LR
    subgraph 创建型
        FM[工厂方法]
        AF[抽象工厂]
        B[生成器]
        P[原型]
        S[单例]
    end
    
    subgraph 结构型
        AD[适配器]
        BR[桥接]
        CO[组合]
        DE[装饰]
        FA[外观]
        FL[享元]
        PR[代理]
    end
    
    subgraph 行为型
        CR[责任链]
        CM[命令]
        IT[迭代器]
        MD[中介者]
        ME[备忘录]
        OB[观察者]
        ST[状态]
        SG[策略]
        TM[模板方法]
        VI[访问者]
    end
    
    FM -->|特化| AF
    AF -->|使用| FM
    B -->|可结合| FM
    P -->|可结合| B
    S -->|常配合| FM
    
    AD -->|类似| BR
    CO -->|常配合| IT
    DE -->|类似| PR
    FA -->|使用| 子系统
    
    CR -->|可结合| OB
    CM -->|可使用| ME
    ST -->|类似| SG
    TM -->|框架层| FM
    VI -->|配合| CO
```

---

## 详细参考

- `references/creational.md` - 创建型模式详解
- `references/structural.md` - 结构型模式详解
- `references/behavioral.md` - 行为模式详解

## 设计原则

1. **开闭原则** - 对扩展开放，对修改关闭
2. **单一职责** - 一个类只做一件事
3. **依赖倒置** - 依赖抽象而非具体
4. **接口隔离** - 使用小而专的接口
5. **里氏替换** - 子类可以替换父类
6. **合成复用** - 优先组合而非继承
