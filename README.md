# amqplib-oop

This is a simple wrapper around the [amqplib](https://www.npmjs.com/package/amqplib) library to make it easier to use in an object-oriented way.
Available for use in both TypeScript and JavaScript (CommonJS).

For more information, view the [documentation](https://jakguru.github.io/amqplib-oop/).

## Installation

```bash
npm install @jakguru/amqplib-oop
```

or

```bash
yarn add @jakguru/amqplib-oop
```

## Usage

### Import / Require the library

```typescript
import { Connection } from '@jakguru/amqplib-oop'
```

or

```typescript
import Connection from '@jakguru/amqplib-oop'
```

or

```javascript
const { Connection } = require('@jakguru/amqplib-oop')
```

### Create an instance of the Connection

```typescript
const client = new Connection()
```

### Get an instance of a Queue

```typescript
const testQueue = client.getQueue('test-queue')
const testQueue2 = client.getQueue('test-queue-2')
```

### Setup a listener for a queue

```typescript
testQueue.listen((message, ack, nack) => {
    // Do something with the message
    // if successful: ack
    // if failed and you want to requeue: nack()
    // if failed but you don't want to requeue: nack(false)
})
```

### Enqueue a message

```typescript
await testQueue.enqueue(Buffer.from('Hello World!'))
```

## TODO Eventually

-   [ ] Add more test cases
-   [ ] Add more documentation & examples
-   [ ] Add "Exchange" functionality