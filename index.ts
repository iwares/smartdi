/// <reference path="node_modules/reflect-metadata/index.d.ts" />

export type Class<T> = { new(...args: any[]): T };
export type AbstractClass<T> = abstract new (...args: any[]) => T;

const $registry = Symbol('registry');
const $singletons = Symbol('singletons');

export interface InjectableOptions {
  name?: string;
  args?: any[];
  multiple?: boolean;
}

interface RegistryItem {
  name: string;
  class: Class<any>;
  args: any[];
  singleton: boolean;
  instance: any;
}

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
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    chain.push(proto);
    proto = Object.getPrototypeOf(proto);
  }
  return chain.reverse();
}

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
  let merged = injectsCache.get(prototype);
  if (merged)
    return merged;

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
  const injects: InjectMetadata = Reflect.getOwnMetadata(METADATA_INJECTS, target) ?? {};
  injects[prop] = item;
  Reflect.defineMetadata(METADATA_INJECTS, injects, target);
}

function appendLifecycle(target: Object, key: string, method: string | symbol): void {
  const methods: Array<string | symbol> = Reflect.getOwnMetadata(key, target) ?? [];
  methods.push(method);
  Reflect.defineMetadata(key, methods, target);
}

export abstract class SmartDI {

  /** @internal */ private static readonly [$registry]: { [key: string]: RegistryItem } = {};
  /** @internal */ private static readonly [$singletons]: RegistryItem[] = [];

  public static register<T>(clazz: Class<T>, options?: InjectableOptions): void {
    const name = options?.name || clazz.name;
    const args = options?.args || [];
    const singleton = !options?.multiple;

    if (SmartDI[$registry][name])
      throw new Error(`Duplicated injectable name '${name}'!`);

    const item = {
      name,
      class: clazz,
      args: args,
      singleton,
      instance: undefined
    };

    if (singleton)
      SmartDI[$singletons].push(item);

    SmartDI[$registry][name] = item;
  }

  public static get<T>(clue: Class<T> | AbstractClass<T>, ...args: any[]): T;
  public static get<T>(name: string, ...args: any[]): T;
  public static get<T>(clue: Class<T> | AbstractClass<T> | string, ...args: any[]): T {
    return SmartDI.internalGet(clue, new Set(), ...args);
  }

  public static getArray<T>(clue: Class<T> | AbstractClass<T>, ...args: any[]): T[] {
    return SmartDI.internalGetArray(clue, new Set(), ...args);
  }

  public static async initialize(): Promise<void> {
    const instances: any[] = [];
    for (const item of SmartDI[$singletons])
      instances.push(SmartDI.obtainInstance(item, new Set()));

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

  public static async uninitialize(): Promise<void> {
    const items = [...SmartDI[$singletons]].reverse();
    const promises: Promise<unknown>[] = [];
    for (const item of items) {
      const instance = item.instance;
      if (!instance)
        continue;

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

  /** @internal */ private static internalGet<T>(clue: Class<T> | AbstractClass<T> | string, creatings: Set<string>, ...args: any[]): T {
    let constructor: Class<T> | AbstractClass<T> | undefined, name: string;
    if (typeof clue === 'function') {
      constructor = clue;
      name = clue.name;
    } else {
      constructor = undefined;
      name = clue;
    }

    let item: RegistryItem | undefined = SmartDI[$registry][name];
    if (!item && constructor)
      item = SmartDI.resolveOneByConstructor(constructor);

    if (!item)
      throw new Error(`Can not resolve injectable '${name}'!`);

    return SmartDI.obtainInstance(item, creatings, ...args);
  }

  /** @internal */ private static internalGetArray<T>(constructor: Class<T> | AbstractClass<T>, creatings: Set<string>, ...args: any[]): T[] {
    const items = SmartDI.resolveByConstructor(constructor);

    if (items.length === 0)
      throw new Error(`Can not resolve injectable '${constructor.name}'!`);

    const instances: T[] = [];
    for (const item of items)
      instances.push(SmartDI.obtainInstance(item, creatings, ...args));

    return instances;
  }

  /** @internal */ private static obtainInstance(item: RegistryItem, creatings: Set<string>, ...args: any[]): any {
    if (item.instance)
      return item.instance;

    if (args.length === 0)
      args = item.args;

    const instance = new item.class(...args) as any;
    if (item.singleton)
      item.instance = instance;

    const injects = collectInjects(instance);
    const injectKeys = Reflect.ownKeys(injects);
    if (!injectKeys.length)
      return instance;

    if (!item.singleton && creatings.has(item.name))
      throw new Error('Circular dependency detected!');
    creatings.add(item.name);

    try {
      for (const prop of injectKeys)
        instance[prop] = injects[prop].array
          ? SmartDI.internalGetArray(injects[prop].clue as Class<any>, creatings, ...injects[prop].args)
          : SmartDI.internalGet(injects[prop].clue, creatings, ...injects[prop].args);
    } catch (e) {
      if (item.singleton)
        item.instance = undefined;
      throw e;
    }

    return instance;
  }

  /** @internal */ private static resolveByConstructor(constructor: Function): RegistryItem[] {
    const matched: RegistryItem[] = [];
    for (const item of Object.values(SmartDI[$registry])) {
      if (isSubclass(item.class, constructor))
        matched.push(item);
    }
    return matched;
  }

  /** @internal */ private static resolveOneByConstructor(constructor: Function): RegistryItem | undefined {
    const matched: RegistryItem[] = [];
    for (const item of Object.values(SmartDI[$registry])) {
      // 类自身优先：以自定义 name 注册时按名称查不到，且子类匹配不包含自身
      if (item.class === constructor)
        return item;
      if (isSubclass(item.class, constructor))
        matched.push(item);
    }

    if (matched.length > 1)
      throw new Error(`Multiple injectable classes found for '${constructor.name}': ${matched.map(item => item.name).join(', ')}`);
    return matched[0];
  }

}

export function Injectable(options?: InjectableOptions): ClassDecorator {
  return (target: Function) => {
    SmartDI.register(target as Class<any>, options);
  }
}

export function Inject(constructor: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator;
export function Inject(name: string, ...args: any[]): PropertyDecorator;
export function Inject(clue: Class<any> | AbstractClass<any> | string, ...args: any[]): PropertyDecorator {
  return function (target: Object, prop: string | symbol): void {
    defineInject(target, prop, { array: false, clue, args });
  }
}

export function InjectArray(constructor: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator;
export function InjectArray(clue: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator {
  return function (target: Object, prop: string | symbol): void {
    defineInject(target, prop, { array: true, clue, args });
  }
}

export function PostConstruct(): MethodDecorator {
  return function (target: Object, key: string | symbol, _descriptor: PropertyDescriptor): void {
    appendLifecycle(target, METADATA_POST_CONSTRUCT, key);
  }
}

export function PreDestroy(): MethodDecorator {
  return function (target: Object, key: string | symbol, _descriptor: PropertyDescriptor): void {
    appendLifecycle(target, METADATA_PRE_DESTROY, key);
  }
}
