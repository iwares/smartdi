/// <reference path="node_modules/reflect-metadata/index.d.ts" />

export type Class<T> = { new(...args: any[]): T };
export type AbstractClass<T> = abstract new (...args: any[]) => T;

const $registry = Symbol('registry');

export interface InjectableOptions {
  name?: string;
  args?: any[];
  multiple?: boolean;
}

interface RegistryItem {
  name: string,
  class: Class<any>,
  args: any[],
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

  public static readonly [$registry]: { [key: string]: RegistryItem } = {};

  public static get<T>(clue: Class<T> | AbstractClass<T>, ...args: any[]): T;
  public static get<T>(name: string, ...args: any[]): T;
  public static get<T>(clue: Class<T> | AbstractClass<T> | string, ...args: any[]): T {
    return SmartDI.internalGet(clue, new Set(), ...args);
  }

  private static internalGet<T>(clue: Class<T> | AbstractClass<T> | string, creatings: Set<string>, ...args: any[]): T {
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
      item = SmartDI.resovleOneByConstructor(constructor);

    if (!item)
      throw new Error(`Can not resolve injectable '${name}'!`);

    return SmartDI.obtainInstance(item, creatings, ...args);
  }

  private static internalGetArray<T>(constructor: Class<T>, creatings: Set<string>, ...args: any[]): T[] {
    const items = SmartDI.resovleByConstructor(constructor);

    if (items.length == 0)
      throw new Error(`Can not resolve injectable '${constructor.name}'!`);

    const instances: T[] = [];
    for (const item of items)
      instances.push(SmartDI.obtainInstance(item, creatings, ...args));

    return instances;
  }

  private static obtainInstance(item: RegistryItem, creatings: Set<string>, ...args: any[]): any {
    if (item.instance)
      return item.instance;

    if (args.length == 0)
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

    for (const prop of Object.keys(injects))
      instance[prop] = injects[prop].array
        ? SmartDI.internalGetArray(injects[prop].clue as Class<any>, creatings, ...injects[prop].args)
        : SmartDI.internalGet(injects[prop].clue, creatings, ...injects[prop].args);

    return instance;
  }

  private static resovleByConstructor(constructor: Function): RegistryItem[] {
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

  private static resovleOneByConstructor(constructor: Function): RegistryItem | undefined {
    const items = SmartDI.resovleByConstructor(constructor);
    if (items.length > 1)
      throw new Error(`Multiple injectable classes found for '${constructor.name}': ${items.map(item => item.name).join(', ')}`);
    return items[0];
  }

}

export function Injectable(options?: InjectableOptions): ClassDecorator {
  return (target: Function) => {
    const name = options?.name || target.name;
    const args = options?.args || [];
    const singleton = !options?.multiple;

    if (SmartDI[$registry][name])
      throw new Error(`Duplicated injectable name '${name}'!`);

    SmartDI[$registry][name] = {
      name,
      class: target as Class<any>,
      args: args,
      singleton,
      instance: undefined
    };
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
