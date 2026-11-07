import 'reflect-metadata';
import { Injectable, SmartDI } from '../index.js';

@Injectable({ name: 'test:renamed', multiple: true })
class Renamed {
}

@Injectable({ name: 'test:registered-base', multiple: true })
class RegisteredBase {
}

@Injectable({ name: 'test:registered-child', multiple: true })
class RegisteredChild extends RegisteredBase {
}

describe('按类解析', () => {
  // Given: Renamed 以自定义名称 test:renamed 注册
  // When:  以类本身作为 clue 调用 SmartDI.get
  // Then:  仍能解析出 Renamed 实例
  it('以自定义名称注册的类仍可按类解析', () => {
    expect(SmartDI.get(Renamed)).toBeInstanceOf(Renamed);
  });

  // Given: RegisteredBase 与其子类 RegisteredChild 都已注册
  // When:  以 RegisteredBase 作为 clue 调用 SmartDI.get
  // Then:  返回 RegisteredBase 实例，而不是匹配到的子类
  it('类自身与子类都注册时，按类解析取类自身', () => {
    const instance = SmartDI.get(RegisteredBase);

    expect(instance.constructor).toBe(RegisteredBase);
  });

  // Given: RegisteredBase 与其子类 RegisteredChild 都已注册
  // When:  调用 SmartDI.getArray(RegisteredBase)
  // Then:  只返回子类 RegisteredChild 的实例，不含 RegisteredBase 自身
  it('getArray 仍只返回子类', () => {
    const instances = SmartDI.getArray(RegisteredBase);

    expect(instances).toHaveLength(1);
    expect(instances[0]).toBeInstanceOf(RegisteredChild);
  });
});