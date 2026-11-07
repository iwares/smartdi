import 'reflect-metadata';
import { Injectable, Inject, PostConstruct, PreDestroy, SmartDI } from '../index.js';

/** 依赖，按名称注册以便用例观察拿到的是哪一个 */
@Injectable({ name: 'test:dep-a', multiple: true })
class DepA {
  public readonly kind = 'a';
}

@Injectable({ name: 'test:dep-b', multiple: true })
class DepB {
  public readonly kind = 'b';
}

@Injectable({ name: 'test:dep-c', multiple: true })
class DepC {
  public readonly kind = 'c';
}

@Injectable({ name: 'test:base', multiple: true })
class Base {
  @Inject('test:dep-a')
  public dependency!: DepA;

  @Inject('test:dep-a')
  public shared!: DepA;
}

@Injectable({ name: 'test:left', multiple: true })
class Left extends Base {
  @Inject('test:dep-b')
  public service!: DepB;
}

@Injectable({ name: 'test:right', multiple: true })
class Right extends Base {
  @Inject('test:dep-c')
  public service!: DepC;
}

@Injectable({ name: 'test:override', multiple: true })
class Override extends Base {
  // 与基类同名字段、不同 clue，类型用 any 以便覆盖
  @Inject('test:dep-b')
  public shared: any;
}

const lifecycle: string[] = [];

@Injectable({ name: 'test:life-base' })
class LifeBase {
  @PostConstruct()
  public startBase(): void {
    lifecycle.push(`${this.constructor.name}:base-start`);
  }

  @PreDestroy()
  public stopBase(): void {
    lifecycle.push(`${this.constructor.name}:base-stop`);
  }
}

@Injectable({ name: 'test:life-child' })
class LifeChild extends LifeBase {
  @PostConstruct()
  public startChild(): void {
    lifecycle.push(`${this.constructor.name}:child-start`);
  }

  @PreDestroy()
  public stopChild(): void {
    lifecycle.push(`${this.constructor.name}:child-stop`);
  }
}

describe('继承时的元数据隔离', () => {
  // Given: Left 继承 Base，Base 声明了 dependency 与 shared 两个注入属性
  // When:  解析 Left 实例
  // Then:  继承来的两个属性都已注入 DepA
  it('基类的注入仍然作用于子类实例', () => {
    const left = SmartDI.get<Left>('test:left');

    expect(left.dependency.kind).toBe('a');
    expect(left.shared.kind).toBe('a');
  });

  // Given: Left 与 Right 都继承 Base，并各自声明同名的 service 属性
  // When:  分别解析 Left 与 Right 实例
  // Then:  各自注入自己的依赖（DepB / DepC），互不覆盖
  it('兄弟类同名属性各自注入对应的类型', () => {
    expect(SmartDI.get<Left>('test:left').service.kind).toBe('b');
    expect(SmartDI.get<Right>('test:right').service.kind).toBe('c');
  });

  // Given: Override 继承 Base 并重新声明同名 shared 字段
  // When:  解析 Override 实例
  // Then:  shared 使用子类的 clue（DepB），基类的其他字段仍然注入
  it('子类同名字段覆盖基类的注入', () => {
    expect(SmartDI.get<Override>('test:override').shared.kind).toBe('b');
    expect(SmartDI.get<Override>('test:override').dependency.kind).toBe('a');
  });
});

describe('继承时的生命周期', () => {
  // Given: LifeChild 继承 LifeBase，两者都声明了 @PostConstruct 方法
  // When:  调用 SmartDI.initialize()
  // Then:  每个实例执行自身原型链上的钩子，基类方法在前且同名只执行一次
  it('基类与子类的钩子各自执行一次，基类在前', async () => {
    lifecycle.length = 0;

    await SmartDI.initialize();

    expect(lifecycle).toEqual([
      'LifeBase:base-start',
      'LifeChild:base-start',
      'LifeChild:child-start',
    ]);
  });

  // Given: 生命周期实例已通过 initialize() 创建
  // When:  调用 SmartDI.uninitialize()
  // Then:  按注册逆序销毁，每个实例只执行自身原型链上的 @PreDestroy
  it('销毁顺序与创建相反，每个实例只执行自己的钩子', async () => {
    lifecycle.length = 0;

    await SmartDI.uninitialize();

    expect(lifecycle).toEqual([
      'LifeChild:base-stop',
      'LifeChild:child-stop',
      'LifeBase:base-stop',
    ]);
  });
});