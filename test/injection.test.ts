import 'reflect-metadata';
import { Injectable, Inject, InjectArray, SmartDI } from '../index.js';

@Injectable({ name: 'test:dep', args: ['dep-arg'], multiple: true })
class Dep {
  constructor(public readonly value: string) {
  }
}

@Injectable({ name: 'test:by-class', multiple: true })
class ByClass {
  @Inject(Dep)
  public dep!: Dep;
}

@Injectable({ name: 'test:by-name', multiple: true })
class ByName {
  @Inject('test:dep')
  public dep!: Dep;
}

@Injectable({ name: 'test:inject-args', multiple: true })
class InjectArgsTarget {
  @Inject(Dep, 'injected-arg')
  public dep!: Dep;
}

@Injectable({ name: 'test:animal', multiple: true })
class Animal {
}

@Injectable({ name: 'test:cat', multiple: true })
class Cat extends Animal {
}

@Injectable({ name: 'test:dog', multiple: true })
class Dog extends Animal {
}

@Injectable({ name: 'test:zoo', multiple: true })
class Zoo {
  @InjectArray(Animal)
  public animals!: Animal[];
}

const DEP_KEY = Symbol('dep');

@Injectable({ name: 'test:symbol', multiple: true })
class SymbolTarget {
  @Inject('test:dep')
  public [DEP_KEY]!: Dep;
}

@Injectable({ name: 'test:cycle-a', multiple: true })
class CycleA {
  // 类型用 any：两个类互相引用，用具体类型会让装饰器元数据在类初始化前访问另一个类
  @Inject('test:cycle-b')
  public b: any;
}

@Injectable({ name: 'test:cycle-b', multiple: true })
class CycleB {
  @Inject('test:cycle-a')
  public a: any;
}

class LazyDep {
}

@Injectable({ name: 'test:lazy-target' })
class LazyTarget {
  @Inject('test:lazy-dep')
  public dep!: LazyDep;
}

abstract class Shape {
}

@Injectable({ name: 'test:circle', multiple: true })
class Circle extends Shape {
}

@Injectable({ name: 'test:square', multiple: true })
class Square extends Shape {
}

class NoMatch {
}

describe('属性注入', () => {
  // Given: ByClass 通过类作为 clue 声明注入
  // When:  解析 ByClass 实例
  // Then:  dep 是 Dep 的实例
  it('按类注入', () => {
    expect(SmartDI.get<ByClass>('test:by-class').dep).toBeInstanceOf(Dep);
  });

  // Given: ByName 通过注册名称声明注入
  // When:  解析 ByName 实例
  // Then:  dep 是 Dep 的实例
  it('按名称注入', () => {
    expect(SmartDI.get<ByName>('test:by-name').dep).toBeInstanceOf(Dep);
  });

  // Given: InjectArgsTarget 的注入声明中带有参数
  // When:  解析 InjectArgsTarget 实例
  // Then:  参数被传给依赖的构造函数，覆盖依赖注册时的 args
  it('注入时传入的 args 覆盖依赖注册时的 args', () => {
    expect(SmartDI.get<InjectArgsTarget>('test:inject-args').dep.value).toBe('injected-arg');
  });

  // Given: Animal 有两个已注册子类 Cat 与 Dog
  // When:  解析声明了 @InjectArray(Animal) 的 Zoo
  // Then:  注入所有已注册子类实例，不含 Animal 自身
  it('InjectArray 注入所有已注册子类', () => {
    const zoo = SmartDI.get<Zoo>('test:zoo');

    expect(zoo.animals).toHaveLength(2);
    expect(zoo.animals.some(animal => animal instanceof Cat)).toBe(true);
    expect(zoo.animals.some(animal => animal instanceof Dog)).toBe(true);
  });

  // Given: 属性使用 Symbol 作为键
  // When:  解析 SymbolTarget 实例
  // Then:  Symbol 键上注入成功
  it('支持 Symbol 键的属性注入', () => {
    expect(SmartDI.get<SymbolTarget>('test:symbol')[DEP_KEY]).toBeInstanceOf(Dep);
  });
});

describe('解析错误与循环依赖', () => {
  // Given: CycleA 与 CycleB 以 multiple 注册并互相注入
  // When:  解析 CycleA
  // Then:  抛出循环依赖错误
  it('非单例循环依赖时抛错', () => {
    expect(() => SmartDI.get('test:cycle-a')).toThrow('Circular dependency detected!');
  });

  // Given: Shape 未注册，但存在 Circle 与 Square 两个已注册子类
  // When:  以 Shape 作为 clue 解析单个实例
  // Then:  因匹配到多个子类而抛错
  it('多个子类匹配按类解析时抛错', () => {
    expect(() => SmartDI.get(Shape)).toThrow(/Multiple injectable classes found for 'Shape'/);
  });

  // Given: NoMatch 没有已注册的子类
  // When:  调用 SmartDI.getArray(NoMatch)
  // Then:  抛出无法解析错误
  it('getArray 没有匹配子类时抛错', () => {
    expect(() => SmartDI.getArray(NoMatch)).toThrow("Can not resolve injectable 'NoMatch'!");
  });

  // Given: LazyTarget 依赖的 test:lazy-dep 尚未注册
  // When:  先解析失败，注册依赖后再次解析
  // Then:  单例缓存已回滚，第二次能够成功创建
  it('单例注入失败后回滚，不会缓存半成品', () => {
    expect(() => SmartDI.get('test:lazy-target')).toThrow("Can not resolve injectable 'test:lazy-dep'!");

    SmartDI.register(LazyDep, { name: 'test:lazy-dep' });

    expect(SmartDI.get<LazyTarget>('test:lazy-target').dep).toBeInstanceOf(LazyDep);
  });
});