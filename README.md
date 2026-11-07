# SmartDI

A simple dependency injector based on decorators.
基于装饰器的简单依赖注入器。

## Installation | 安装

```bash
npm install smartdi
```

## Prerequisites | 先决条件

Import the `reflect-metadata` package on the first line of your application.
在应用程序的第一行导入 `reflect-metadata` 包。

```typescript
import 'reflect-metadata'

// Your code here...
```

Enable `emitDecoratorMetadata` and `experimentalDecorators` in your `tsconfig.json`.
在 `tsconfig.json` 中启用 `emitDecoratorMetadata` 和 `experimentalDecorators`。

```json
{
  "emitDecoratorMetadata": true,
  "experimentalDecorators": true,
}
```

## Basic Usage | 基本用法

### Singleton | 单例

```typescript
import 'reflect-metadata'
import { SmartDI, Injectable, Inject } from 'smartdi';

@Injectable()
class ExampleService {

  sayHello() {
    console.log('Hello');
  }

}

@Injectable()
class ExampleController {

  @Inject(ExampleService)
  private readonly myService!: ExampleService;

  sayHello() {
    this.myService.sayHello();
  }

}

const controller = SmartDI.get(ExampleController);
controller.sayHello();
```

### Factory | 工厂模式

```typescript
import 'reflect-metadata'
import { SmartDI, Injectable, Inject } from 'smartdi';

interface Shape {
  area(): number;
}

// multiple means that the injectable is not singleton.
@Injectable({name: 'circle', multiple: true})
class Circle implements Shape {

  private radius: number;

  constructor(radius: number) {
    this.radius = radius;
  }

  area(): number {
    return Math.PI * this.radius * this.radius;
  }

}

@Injectable({name: 'rect', multiple: true})
class Rect implements Shape {

  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  area(): number {
    return this.width * this.height;
  }

}

const type1 = 'circle';
const args1 = [5]; // radius = 5;
const shape1 = SmartDI.get<Shape>(type1, ...args1);
const area1 = shape1.area();
const type2 = 'rect';
const args2 = [3, 4]; // width = 3, height = 4;
const shape2 = SmartDI.get<Shape>(type2, ...args2);
const area2 = shape2.area();

```

### Circular Dependency | 循环依赖

```typescript
import 'reflect-metadata'
import { SmartDI, Injectable, Inject } from 'smartdi';

@Injectable()
class ExampleServiceA {

  @Inject(ExampleServiceB)
  private readonly exampleServiceB!: ExampleServiceB;

}

@Injectable()
class ExampleServiceB {

  @Inject(ExampleServiceA)
  private readonly exampleServiceA!: ExampleServiceA;

}

const serviceA = SmartDI.get(ExampleServiceA);
const serviceB = SmartDI.get(ExampleServiceB);

```

## APIs | 接口

### @Injectable(options?)

Decorate a class as injectable. An "injectable" refers to a class that can be instantiated and injected into other components.
将类装饰为 `injectable`。`injectable` 类是指可以被实例化并注入到其他组件中的类。

 - options: Injectable options.
 - options: 可注入选项。

| name \| 字段名 | description \| 描述 |
| --- | --- |
| name | The name of the `injectable`. If not specified, the class name will be used.<br>`injectable` 的名称。若未指定，则使用类名。 |
| multiple | Whether the `injectable` is a factory. If not specified, the `injectable` is a singleton.<br>`injectable` 的是否为工厂模式。若未指定，则为单例。 |
| args | Default arguments of the `injectable`'s constructor. Defaults to [].<br>`injectable` 的构造函数的默认参数。默认为 []。 |

### @Inject(clue, ...args)

Decorate a property as a candidate for injection, which will be injected according to the specified clue.
将属性装饰为待注入的，将根据指定的线索进行注入。

 - clue: Name, type, or abstract class of `injectable`.
 - clue: `injectable` 的名称、类型或抽象类。
 - args: Arguments to pass to constructor.
 - args: 传递给构造函数的参数。

### @InjectArray(clue, ...args)

Decorate a property as a candidate for injection, which will be injected according to the specified clue.
将属性装饰为待注入的，将根据指定的线索进行注入。
The property's type must be `Array` and the clue must be a type. All injectables that are subtypes of the specified type will be injected.
属性的类型必须为 `Array`，且线索必须为 `injectable` 的类型。指定 `injectable` 类型的所有子类的 `injectable` 都将被注入。

 - clue: Type or abstract class of the `injectable`.
 - clue: `injectable` 的类型或抽象类。
 - args: Arguments to pass to constructor.
 - args:传递给构造函数的参数。

### SmartDI.get(clue, ...args)

Get an instance of the `injectable` by name or type.
根据名称或类型获取 `injectable` 的实例。

 - clue: Name of the `injectable` or type of the injectable.
 - clue:  `injectable` 的名称或类型。
 - args: Arguments to pass to constructor.
 - args: 传递给构造函数的参数。

### SmartDI.register(clazz, options?)

Programmatically register a class as an `injectable`, serving as an alternative to the `@Injectable` decorator.
以编程方式注册类为 `injectable`，作为 `@Injectable` 装饰器的替代方案。

 - clazz: Class to register.
 - clazz: 要注册的类。
 - options: Same as `@Injectable` options.
 - options: 与 `@Injectable` 的选项相同。

### SmartDI.getArray(clue, ...args)

Get all registered subtypes of the specified type as an array.
以数组形式获取指定类型的所有已注册子类型的实例。

 - clue: Type or abstract class of the `injectable`.
 - clue: `injectable` 的类型或抽象类。
 - args: Arguments to pass to constructor.
 - args: 传递给构造函数的参数。

### SmartDI.initialize()

Create all singleton instances and invoke all methods decorated with `@PostConstruct`. Supports both synchronous and asynchronous lifecycle hooks.
创建所有单例实例，并调用所有使用 `@PostConstruct` 装饰的方法。支持同步和异步的生命周期钩子。

### SmartDI.uninitialize()

Clear all singleton instances in reverse registration order, invoking the `@PreDestroy` decorated methods for each.
按注册逆序清空所有单例实例，并调用使用 `@PreDestroy` 装饰的方法。

### @PostConstruct()

Decorate a method as a lifecycle hook, which will be invoked when `SmartDI.initialize()` is called.
将方法装饰为生命周期钩子，在调用 `SmartDI.initialize()` 时执行。

### @PreDestroy()

Decorate a method as a lifecycle hook, which will be invoked when `SmartDI.uninitialize()` is called.
将方法装饰为生命周期钩子，在调用 `SmartDI.uninitialize()` 时执行。

## Inheritance | 继承

Injected properties and lifecycle hooks declared on base classes apply to subclass instances. Decorators write only the metadata of the class they decorate; the prototype chain is merged when an instance is created.

基类声明的注入属性与生命周期钩子会对子类实例生效。装饰器只写入所在类自己的元数据，实例创建时再沿原型链合并。

- Injected properties are merged base-first, so a subclass property with the same name overrides the base one.
  注入属性按基类在前合并，子类同名字段覆盖基类字段。
- `@PostConstruct` / `@PreDestroy` methods run once per instance, base-class hooks first.
  每个实例的 `@PostConstruct` / `@PreDestroy` 各执行一次，基类钩子在前。

## Limitations

Injection is processed after construction, so do not access injectable values in the constructor.
注入是在构造函数执行之后再进行处理的，因此不要在构造函数中访问可注入的值。

## License
MIT
