import 'reflect-metadata';
import { Injectable, SmartDI } from '../index.js';

let singletonCounter = 0;

@Injectable()
class SingletonService {
  public readonly id = ++singletonCounter;
}

let multipleCounter = 0;

@Injectable({ multiple: true })
class MultipleService {
  public readonly id = ++multipleCounter;
}

@Injectable({ name: 'test:args', args: ['from-options'], multiple: true })
class ArgsService {
  constructor(public readonly value: string) {
  }
}

class ProgrammaticService {
  constructor(public readonly value: string) {
  }
}

describe('注册与实例化', () => {
  // Given: SingletonService 以默认配置（单例）注册
  // When:  连续调用两次 SmartDI.get
  // Then:  两次返回同一个实例
  it('默认注册为单例', () => {
    const first = SmartDI.get(SingletonService);
    const second = SmartDI.get(SingletonService);

    expect(first).toBe(second);
  });

  // Given: MultipleService 以 multiple: true 注册
  // When:  连续调用两次 SmartDI.get
  // Then:  每次返回新实例
  it('multiple 注册时每次解析都新建实例', () => {
    const first = SmartDI.get(MultipleService);
    const second = SmartDI.get(MultipleService);

    expect(first).not.toBe(second);
  });

  // Given: ProgrammaticService 未使用装饰器
  // When:  通过 SmartDI.register 以名称注册后解析
  // Then:  可以拿到注册时指定的构造参数
  it('register 可以编程式注册并按名称解析', () => {
    SmartDI.register(ProgrammaticService, { name: 'test:programmatic', args: ['registered'], multiple: true });

    expect(SmartDI.get<ProgrammaticService>('test:programmatic').value).toBe('registered');
  });

  // Given: 已用同一名称注册过一个类
  // When:  再次注册另一个类且名称相同
  // Then:  抛出重复注册错误
  it('重复名称注册时抛错', () => {
    class DuplicateService {
    }
    SmartDI.register(DuplicateService, { name: 'test:duplicate' });

    expect(() => SmartDI.register(DuplicateService, { name: 'test:duplicate' }))
      .toThrow("Duplicated injectable name 'test:duplicate'!");
  });

  // Given: 名称 test:missing 未注册
  // When:  按名称解析
  // Then:  抛出无法解析错误
  it('解析未注册的名称时抛错', () => {
    expect(() => SmartDI.get('test:missing')).toThrow("Can not resolve injectable 'test:missing'!");
  });

  // Given: ArgsService 注册时指定了 args
  // When:  解析时不传参数
  // Then:  使用注册时的 args 构造实例
  it('使用注册时的 args 构造实例', () => {
    expect(SmartDI.get<ArgsService>('test:args').value).toBe('from-options');
  });

  // Given: ArgsService 注册时指定了 args
  // When:  解析时传入自定义参数
  // Then:  调用时传入的 args 覆盖注册时的 args
  it('解析时传入的 args 覆盖注册时的 args', () => {
    expect(SmartDI.get<ArgsService>('test:args', 'from-call').value).toBe('from-call');
  });
});