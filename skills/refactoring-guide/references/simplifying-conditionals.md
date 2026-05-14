# 简化条件表达式 (Simplifying Conditional Expressions)

处理复杂条件逻辑的重构技术。

---

## 分解条件表达式 (Decompose Conditional)

**问题：** 有一个复杂的 if/then/else 条件语句。

**解决方案：** 将条件、then 和 else 分支提取为独立的函数。

**如何重构：**
1. 提取条件为独立函数
2. 提取 then 分支为独立函数
3. 提取 else 分支为独立函数
4. 用函数调用替换原始条件

---

## 合并条件表达式 (Consolidate Conditional Expression)

**问题：** 有多个条件产生相同的结果或动作。

**解决方案：** 将所有这些条件合并为一个条件表达式。

---

## 合并重复的条件片段 (Consolidate Duplicate Conditional Fragments)

**问题：** 条件的所有分支中都有相同的代码。

**解决方案：** 将重复的代码移到条件之外。

---

## 移除控制标记 (Remove Control Flag)

**问题：** 有一个布尔变量作为条件表达式中的控制标记。

**解决方案：** 使用 break、continue 和 return 替换控制标记。

---

## 以卫语句取代嵌套条件表达式 (Replace Nested Conditional with Guard Clauses)

**问题：** 一系列条件导致了不同的结果，没有逻辑上的先后顺序。

**解决方案：** 用卫语句替换这些条件。

**何时使用：** 深层嵌套的条件使代码难以阅读。

---

## 以多态取代条件表达式 (Replace Conditional with Polymorphism)

**问题：** 条件表达式根据对象的类型选择不同的行为。

**解决方案：** 为每种条件创建一个子类，并在子类中覆盖条件分支。

---

## 引入Null对象 (Introduce Null Object)

**问题：** 代码中有多处检查 null 值。

**解决方案：** 用一个什么都不做（或提供默认值）的对象替换 null 值。

---

## 引入断言 (Introduce Assertion)

**问题：** 代码中有一段只有在特定条件为真时才能工作的代码。

**解决方案：** 用断言替换这个假设。
