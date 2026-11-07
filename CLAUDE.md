# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## 项目概述

**SmartDI** 是一个基于装饰器和 `reflect-metadata` 的轻量级 TypeScript 依赖注入库。全部源码在一个文件中：[index.ts](index.ts)。发布到 npm 的包名为 `smartdi`。

## 构建命令

```bash
npm run build              # 编译 → index.js + index.d.ts
```

- 测试用 jest + ts-jest，`npx jest` 直接运行 `test/` 下的 TypeScript 用例。
- `tsconfig.json` 启用了 `experimentalDecorators` + `emitDecoratorMetadata`。
- 构建产物（`index.js`、`index.d.ts`）在 `.gitignore` 中。
- `.vscode/settings.json` 将 TS 锁定为 `node_modules/typescript/lib`（v6.0.3）。

## 架构

所有代码在 [index.ts](index.ts) 中。

### 公共 API

| 导出 | 用途 |
|---|---|
| `@Injectable(options?)` | 类装饰器 — 自动注册到 DI 容器。默认单例；`multiple: true` 则为工厂模式（每次 `get` 新建实例）。 |
| `@Inject(clue, ...args)` | 属性装饰器 — 标记属性进行注入。`clue` 可以是类（按类型查找）或字符串名称。 |
| `@InjectArray(clue, ...args)` | 属性装饰器 — 注入 `clue` 的所有已注册子类型，以数组形式。 |
| `@PostConstruct()` | 方法装饰器 — 在 `SmartDI.initialize()` 时调用。 |
| `@PreDestory()` | 方法装饰器 — 在 `SmartDI.uninitialize()` 时调用。 |
| `SmartDI.get(clue, ...args)` | 按类类型或名称解析实例。 |
| `SmartDI.getArray(clue, ...args)` | 按类类型解析所有匹配实例为数组。 |
| `SmartDI.register(clazz, options?)` | 编程式注册（替代 `@Injectable`）。 |
| `SmartDI.initialize()` | 创建所有单例实例，调用 `@PostConstruct` 方法。 |
| `SmartDI.uninitialize()` | 按注册逆序调用 `@PreDestory` 方法，清空单例。 |

### 内部机制

- **注册表**：以名称为键的普通对象，映射到 `RegistryItem`（包含 class、args、singleton 标志、缓存实例）。
- **解析策略**：`get()` 优先按名称查找；若传入类，先找该类自身的注册项（支持以自定义 `name` 注册的类），再沿原型链找子类。多个子类匹配时抛出异常。`getArray()` 只收集子类，不含类自身。
- **注入流程**：在 `new Class(...args)` **之后**通过装饰器存储的元数据填充属性。非单例使用 `creatings` Set 进行循环依赖检测。
- **继承**：装饰器只写 `getOwnMetadata`（本类自己的元数据）；创建实例时沿原型链合并——注入属性基类在前、子类同名覆盖，生命周期方法基类在前、同名去重。切勿在装饰器里改用会沿原型链继承的 `getMetadata`：那会让同一基类的所有子类共用一份元数据，同名字段互相覆盖，且结果取决于类的装饰顺序。
- **元数据键**：`smartdi:injects`、`smartdi:post-construct`、`smartdi:pre-destroy`。

## 注意事项

- `reflect-metadata` 被列为 devDependency，但消费者运行时也需要它（应该是 peerDependency）。
- 注入在构造函数执行**之后**进行，不要在构造函数中访问注入的属性。
