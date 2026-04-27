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
      let methods: Array<string | symbol> = Reflect.getMetadata('smartdi:post-construct', instance);
      if (!methods?.length)
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

      let methods: Array<string | symbol> = Reflect.getMetadata('smartdi:pre-destroy', instance);
      if (!methods?.length)
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

    const injects = Reflect.getMetadata('smartdi:injects', instance) as { [key: string | symbol]: InjectItem };
    if (!injects)
      return instance;

    if (!item.singleton && creatings.has(item.name))
      throw new Error('Circular dependency detected!');
    creatings.add(item.name);

    try {
      for (const prop of Reflect.ownKeys(injects))
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
    let matched: RegistryItem[] = [];

    function isSubclass(sub: Function, sup: Function): boolean {
      let proto = Object.getPrototypeOf(sub);
      while (proto) {
        if (proto === sup)
          return true;
        proto = Object.getPrototypeOf(proto);
      }
      return false;
    }

    for (const item of Object.values(SmartDI[$registry])) {
      if (!isSubclass(item.class, constructor))
        continue;
      matched.push(item);
    }

    return matched;
  }

  /** @internal */ private static resolveOneByConstructor(constructor: Function): RegistryItem | undefined {
    const items = SmartDI.resolveByConstructor(constructor);
    if (items.length > 1)
      throw new Error(`Multiple injectable classes found for '${constructor.name}': ${items.map(item => item.name).join(', ')}`);
    return items[0];
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
    let injects: { [key: string | symbol]: InjectItem } = Reflect.getMetadata('smartdi:injects', target) || {};
    injects[prop] = { array: false, clue, args };
    Reflect.defineMetadata('smartdi:injects', injects, target);
  }
}

export function InjectArray(constructor: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator;
export function InjectArray(clue: Class<any> | AbstractClass<any>, ...args: any[]): PropertyDecorator {
  return function (target: Object, prop: string | symbol): void {
    let injects: { [key: string | symbol]: InjectItem } = Reflect.getMetadata('smartdi:injects', target) || {};
    injects[prop] = { array: true, clue, args };
    Reflect.defineMetadata('smartdi:injects', injects, target);
  }
}

export function PostConstruct(): MethodDecorator {
  return function (target: Object, key: string | symbol, _descriptor: PropertyDescriptor): void {
    let methods: Array<string | symbol> = Reflect.getMetadata('smartdi:post-construct', target) || [];
    methods.push(key);
    Reflect.defineMetadata('smartdi:post-construct', methods, target);
  }
}

export function PreDestroy(): MethodDecorator {
  return function (target: Object, key: string | symbol, _descriptor: PropertyDescriptor): void {
    let methods: Array<string | symbol> = Reflect.getMetadata('smartdi:pre-destroy', target) || [];
    methods.push(key);
    Reflect.defineMetadata('smartdi:pre-destroy', methods, target);
  }
}
