/// <reference path="node_modules/reflect-metadata/index.d.ts" />

/** 可实例化的类（构造函数） */
export type Class<T> = { new(...args: any[]): T };
/** 抽象类（构造函数），只能作为解析线索，不能直接实例化 */
export type AbstractClass<T> = abstract new (...args: any[]) => T;

const $registry = Symbol('registry');
const $singletons = Symbol('singletons');

export interface InjectableOptions {
  /** 注册名称，默认为类名 */
  name?: string;
  /** 构造参数，默认无参 */
  args?: any[];
  /** 每次解析都创建新实例（工厂模式），默认单例 */
  multiple?: boolean;
}

/** 注册表中的一项，单例的实例缓存在 instance 上 */
interface RegistryItem {
  name: string;
  class: Class<any>;
  args: any[];
  singleton: boolean;
  instance: any;
}

/** 注入元数据：单个依赖（array=false）或依赖数组（array=true） */
interface InjectItemObject {
  array: false;
  clue: string | Class<any> | AbstractClass<any>,
  args: any[]
}

interface InjectItemArray {
  array: true;
  clue: Class<any> | AbstractClass<any>,
  args: any[]
}

type InjectItem = InjectItemObject | InjectItemArray;
type InjectMetadata = { [key: string | symbol]: InjectItem };

const METADATA_INJECTS = 'smartdi:injects';
const METADATA_POST_CONSTRUCT = 'smartdi:post-construct';
const METADATA_PRE_DESTROY = 'smartdi:pre-destroy';

/** 实例的原型链，基类在前；不含 Object.prototype */
function prototypeChain(instance: Object): Object[] {
  const chain: Object[] = [];
  // 从实例原型开始逐层向上，跳过 Object.prototype
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    chain.push(proto);
    proto = Object.getPrototypeOf(proto);
  }
  return chain.reverse();
}

/** sub 的构造器链上是否包含 sup */
function isSubclass(sub: Function, sup: Function): boolean {
  let proto = Object.getPrototypeOf(sub);
  while (proto) {
    if (proto === sup)
      return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/** 按类原型缓存合并后的注入元数据：装饰器在类定义期写入，之后不再变化 */
const injectsCache = new WeakMap<Object, InjectMetadata>();

/**
 * 沿原型链收集自有的注入元数据：基类在前，子类同名字段覆盖基类。
 *
 * 装饰器只写自己那一层的元数据，继承合并放到注入时做——若在装饰器里用会沿原型链
 * 继承的 `getMetadata`，子类的条目会被写进基类的对象，同一基类的所有子类共用一份，
 * 同名字段互相覆盖（后装饰者胜出，且取决于 import 顺序）。
 */
function collectInjects(instance: Object): InjectMetadata {
  const prototype = Object.getPrototypeOf(instance);
  // 合并结果按类原型缓存：类定义完成后元数据不再变化
  let merged = injectsCache.get(prototype);
  if (merged)
    return merged;

  // 基类在前浅合并，子类同名字段自然覆盖基类
  merged = {};
  for (const proto of prototypeChain(instance))
    Object.assign(merged, Reflect.getOwnMetadata(METADATA_INJECTS, proto));
  injectsCache.set(prototype, merged);
  return merged;
}

/** 沿原型链收集生命周期方法：基类在前，同名方法只执行一次 */
function collectLifecycle(instance: Object, key: string): Array<string | symbol> {
  const methods: Array<string | symbol> = [];
  const seen = new Set<string | symbol>();
  // 基类在前；同名方法只在第一次出现时保留
  for (const proto of prototypeChain(instance)) {
    for (const method of Reflect.getOwnMetadata(key, proto) ?? []) {
      if (seen.has(method))
        continue;
      seen.add(method);
      methods.push(method);
    }
  }
  return methods;
}

/** 只读写本层自有的注入元数据：继承合并留给注入时做，避免兄弟类共用同一个对象 */
function defineInject(target: Object, prop: string | symbol, item: InjectItem): void {
  // 本层已有元数据时直接修改，没有则以空对象开始
  const injects: InjectMetadata = Reflect.getOwnMetadata(METADATA_INJECTS, target) ?? {};
  injects[prop] = item;
  Reflect.defineMetadata(METADATA_INJECTS, injects, target);
}

/** 追加本层自己的生命周期方法，继承合并留给收集时做 */
function appendLifecycle(target: Object, key: string, method: string | symbol): void {
  // 本层已有方法列表时直接追加，没有则以空数组开始
  const methods: Array<string | symbol> = Reflect.getOwnMetadata(key, target) ?? [];
  methods.push(method);
  Reflect.defineMetadata(key, methods, target);
}

/** 依赖注入容器：注册可注入类、解析实例，并管理单例的生命周期 */
export abstract class SmartDI {

  /** @internal */ private static readonly [$registry]: { [key: string]: RegistryItem } = {};
  /** @internal */ private static readonly [$singletons]: RegistryItem[] = [];

  /** 注册可注入类，等价于 @Injectable 装饰器 */
  public static register<T>(clazz: Class<T>, options?: InjectableOptions): void {
    // 默认值：名称取类名、无构造参数、单例
    const name = options?.name || clazz.name;
    const args = options?.args || [];
    const singleton = !options?.multiple;

    // 注册表以名称唯一，重复注册直接报错，避免解析歧义
    if (SmartDI[$registry][name])
      throw new Error(`Duplicated injectable name '${name}'!`);

    const item = {
      name,
      class: clazz,
      args: args,
      singleton,
      instance: undefined
    };

    // 只有单例需要进入初始化/销毁列表
    if (singleton)
      SmartDI[$singletons].push(item);

    SmartDI[$registry][name] = item;
  }

  /** 按类或注册名称解析单个实例 */
  public static get<T>(clue: Class<T> | AbstractClass<T>, ...args: any[]): T;
  public static get<T>(name: string, ...args: any[]): T;
  public static get<T>(clue: Class<T> | AbstractClass<T> | string, ...args: any[]): T {
    return SmartDI.internalGet(clue, new Set(), ...args);
  }

  /** 按类解析所有已注册子类的实例 */
  public static getArray<T>(clue: Class<T> | AbstractClass<T>, ...args: any[]): T[] {
    return SmartDI.internalGetArray(clue, new Set(), ...args);
  }

  /** 创建所有单例并调用 @PostConstruct 方法，异步钩子会被等待 */
  public static async initialize(): Promise<void> {
    // 先创建全部单例，再统一执行钩子
    const instances: any[] = [];
    for (const item of SmartDI[$singletons])
      instances.push(SmartDI.obtainInstance(item, new Set()));

    // 异步钩子先收集，全部启动后统一等待
    const promises: Promise<unknown>[] = [];
    for (const instance of instances) {
      const methods: Array<string | symbol> = collectLifecycle(instance, METADATA_POST_CONSTRUCT);
      if (!methods.length)
        continue;

      for (const method of methods) {
        const result = instance[method]();
        if (result instanceof Promise)
          promises.push(result);
      }
    }

    if (!promises.length)
      return;

    await Promise.all(promises);
  }

  /** 按注册逆序调用 @PreDestroy 并清空单例，异步钩子会被等待 */
  public static async uninitialize(): Promise<void> {
    // 按注册逆序销毁
    const items = [...SmartDI[$singletons]].reverse();
    const promises: Promise<unknown>[] = [];
    for (const item of items) {
      const instance = item.instance;
      // 跳过未创建或已销毁的单例
      if (!instance)
        continue;

      // 先清空缓存再执行钩子，钩子内解析会创建新实例
      item.instance = undefined;

      const methods: Array<string | symbol> = collectLifecycle(instance, METADATA_PRE_DESTROY);
      if (!methods.length)
        continue;

      for (const method of methods) {
        const result = instance[method]();
        if (result instanceof Promise)
          promises.push(result);
      }
    }

    if (!promises.length)
      return;

    await Promise.all(promises);
  }

  /** @internal 按类或名称查找注册项；creatings 用于检测非单例的循环依赖 */
  private static internalGet<T>(clue: Class<T> | AbstractClass<T> | string, creatings: Set<string>, ...args: any[]): T {
    // 类线索先按类名查表；字符串线索本身就是名称
    let constructor: Class<T> | AbstractClass<T> | undefined, name: string;
    if (typeof clue === 'function') {
      constructor = clue;
      name = clue.name;
    } else {
      constructor = undefined;
      name = clue;
    }

    // 名称未命中时按类匹配，兼容自定义 name 注册与子类回退
    let item: RegistryItem | undefined = SmartDI[$registry][name];
    if (!item && constructor)
      item = SmartDI.resolveOneByConstructor(constructor);

    if (!item)
      throw new Error(`Can not resolve injectable '${name}'!`);

    return SmartDI.obtainInstance(item, creatings, ...args);
  }

  /** @internal 解析某个类的所有已注册子类实例 */
  private static internalGetArray<T>(constructor: Class<T> | AbstractClass<T>, creatings: Set<string>, ...args: any[]): T[] {
    // 只匹配子类；没有匹配项按无法解析处理
    const items = SmartDI.resolveByConstructor(constructor);

    if (items.length === 0)
      throw new Error(`Can not resolve injectable '${constructor.name}'!`);

    const instances: T[] = [];
    for (const item of items)
      instances.push(SmartDI.obtainInstance(item, creatings, ...args));

    return instances;
  }

  /** @internal 创建实例并填充注入属性；单例注入失败时回滚缓存的实例 */
  private static obtainInstance(item: RegistryItem, creatings: Set<string>, ...args: any[]): any {
    // 单例直接复用已缓存的实例
    if (item.instance)
      return item.instance;

    // 未显式传参时回退到注册时的参数
    if (args.length === 0)
      args = item.args;

    // 单例先缓存，注入期间解析到自身时可复用；注入失败会在下方回滚
    const instance = new item.class(...args) as any;
    if (item.singleton)
      item.instance = instance;

    // 没有注入属性，构造完成即为最终实例
    const injects = collectInjects(instance);
    const injectKeys = Reflect.ownKeys(injects);
    if (!injectKeys.length)
      return instance;

    // 非单例的循环依赖：同名实例仍在创建中
    if (!item.singleton && creatings.has(item.name))
      throw new Error('Circular dependency detected!');
    creatings.add(item.name);

    try {
      for (const prop of injectKeys)
        instance[prop] = injects[prop].array
          ? SmartDI.internalGetArray(injects[prop].clue as Class<any>, creatings, ...injects[prop].args)
          : SmartDI.internalGet(injects[prop].clue, creatings, ...injects[prop].args);
    } catch (e) {
      // 注入失败时清掉单例缓存，避免留下半成品
      if (item.singleton)
        item.instance = undefined;
      throw e;
    }

    return instance;
  }

  /** @internal 匹配某个类的所有已注册子类（不含自身） */
  private static resolveByConstructor(constructor: Function): RegistryItem[] {
    // 遍历注册表，收集所有子类注册项
    const matched: RegistryItem[] = [];
    for (const item of Object.values(SmartDI[$registry])) {
      if (isSubclass(item.class, constructor))
        matched.push(item);
    }
    return matched;
  }

  /** @internal 按类匹配单个注册项：自身优先，否则要求子类唯一 */
  private static resolveOneByConstructor(constructor: Function): RegistryItem | undefined {
    const matched: RegistryItem[] = [];
    for (const item of Object.values(SmartDI[$registry])) {
      // 类自身优先：以自定义 name 注册时按名称查不到，且子类匹配不包含自身
      if (item.class === constructor)
        return item;
      if (isSubclass(item.class, constructor))
        matched.push(item);
    }

    // 无自身注册时回退到唯一子类；有歧义则直接报错
    if (matched.length > 1)
      throw new Error(`Multiple injectable classes found for '${constructor.name}': ${matched.map(item => item.name).join(', ')}`);
    return matched[0];
  }

}

/** 类装饰器：把类注册到容器。默认单例；multiple 时每次解析都新建实例 */
export function Injectable(options?: InjectableOptions): ClassDecorator {
  return (target: Function) => {
    SmartDI.register(target as Class<any>, options);
  }
}

/** 属性装饰器：注入 clue 对应的实例，clue 可以是类或注册名称 */
export function Inject(constructor: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator;
export function Inject(name: string, ...args: any[]): PropertyDecorator;
export function Inject(clue: Class<any> | AbstractClass<any> | string, ...args: any[]): PropertyDecorator {
  return function (target: Object, prop: string | symbol): void {
    defineInject(target, prop, { array: false, clue, args });
  }
}

/** 属性装饰器：注入 clue 的所有已注册子类实例为数组 */
export function InjectArray(constructor: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator;
export function InjectArray(clue: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator {
  return function (target: Object, prop: string | symbol): void {
    defineInject(target, prop, { array: true, clue, args });
  }
}

/** 方法装饰器：在 SmartDI.initialize() 时调用 */
export function PostConstruct(): MethodDecorator {
  return function (target: Object, key: string | symbol, _descriptor: PropertyDescriptor): void {
    appendLifecycle(target, METADATA_POST_CONSTRUCT, key);
  }
}

/** 方法装饰器：在 SmartDI.uninitialize() 时调用 */
export function PreDestroy(): MethodDecorator {
  return function (target: Object, key: string | symbol, _descriptor: PropertyDescriptor): void {
    appendLifecycle(target, METADATA_PRE_DESTROY, key);
  }
}
