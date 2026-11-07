import 'reflect-metadata';
import { Injectable, PostConstruct, PreDestroy, SmartDI } from '../index.js';

const events: string[] = [];

@Injectable({ name: 'test:lifecycle' })
class LifecycleService {
  @PostConstruct()
  public async start(): Promise<void> {
    await Promise.resolve();
    events.push('start');
  }

  @PreDestroy()
  public stop(): void {
    events.push('stop');
  }
}

describe('生命周期', () => {
  // Given: LifecycleService 以单例注册，并声明同步与异步生命周期钩子
  // When:  调用 SmartDI.initialize()
  // Then:  异步 @PostConstruct 被等待并执行完成，单例已创建
  it('initialize 创建单例并等待异步 @PostConstruct', async () => {
    events.length = 0;

    await SmartDI.initialize();

    expect(events).toEqual(['start']);
    expect(SmartDI.get('test:lifecycle')).toBeInstanceOf(LifecycleService);
  });

  // Given: 单例已创建并声明了 @PreDestroy
  // When:  调用 SmartDI.uninitialize()
  // Then:  钩子执行，单例缓存被清空，再次解析会创建新实例
  it('uninitialize 调用 @PreDestroy 并清空单例', async () => {
    const first = SmartDI.get<LifecycleService>('test:lifecycle');
    events.length = 0;

    await SmartDI.uninitialize();

    expect(events).toEqual(['stop']);
    expect(SmartDI.get<LifecycleService>('test:lifecycle')).not.toBe(first);
  });
});