# SmartDI

A simple dependency injector based on decorators.

## Installation

```bash
npm install smartdi
```

## Prerequisites

Import the reflect-metadata package at the first line of your application.

```typescript
import 'reflect-metadata'

// Your code here...
```

Enable "emitDecoratorMetadata" and "experimentalDecorators" in your tsconfig.json.

```json
{
  "emitDecoratorMetadata": true,
  "experimentalDecorators": true,
}
```

## Basic Usage

### Singlton

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

### Factory

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

### Circular Dependency

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

## APIs

### @Injectable(options?)

Decorate a class as injectable. An "injectable" refers to a class that can be instantiated and injected into other components.

 - options: Injectable options.

| name | description |
| --- | --- |
| name | The name of the injectable. If not specified, the class name will be used. |
| multiple | Whether the injectable is a factory. If not specified, the injectable is a singleton. |
| args | Default arguments of the injectable's constructor. default is []. |

### @Inject(cule, ...args)

Decorate a property as injectable, which will be injected according to the specified clue.

 - clue: Name of the injectable or type of the injectable.
 - args: Arguments to pass to constructor.

### @InjectArray(clue, ...args)

Decorate a property as injectable, which will be injected according to the specified clue. 
The property's type must be Array and the clue must be a type. All injectables that are subtypes of the specified type will be injected.

 - clue: Type of the injectable.
 - args: Arguments to pass to constructor.

### SmartDI.get(clue, ...args)

Get the injectable by name or type.

 - clue: Name of the injectable or type of the injectable.
 - args: Arguments to pass to constructor.

## Limitations

Injection is processed after construction, so do not access injectable values in the constructor.

## License
MIT
