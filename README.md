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

## Instrumentation

When debugging an issue, it is important to be able to see what is actually happening. In order to faciliate this, the library instrumentation hooks which can be set on both `Connection` and the `Queue` instances.
This allows you to hook instrumentors like [NewRelic](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/api-guides/nodejs-agent-api/) into your connections and queues to get a deeper understanding of how your application is using RabbitMQ.

Here's an example of how to use the instrumentation hooks on the `Connection` instance.
You can see that it implements all of the possible instrumentors available on the [ConnectionInstrumentors](https://jakguru.github.io/amqplib-oop/interfaces/ConnectionInstrumentors.html) interface.

```typescript
import { Connection } from '@jakguru/amqplib-oop'
import newrelic from 'newrelic'
const config = {} // Your RabbitMQ config
const connection = new Connection(config, {
  assertQueue: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.assertQueue'),
  createChannel: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.createChannel'),
  eventEmitter: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.eventEmitter'),
  eventListener: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.eventListener'),
  getQueue: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.getQueue'),
  initialization: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.initialization'),
  shutdown: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.shutdown'),
})
```

Here's an example of how to use the instrumentation hooks on the `Queue` instance.
You can see that it implements all of the possible instrumentors available on the [QueueInstrumentors](https://jakguru.github.io/amqplib-oop/interfaces/QueueInstrumentors.html) interface.

```typescript
import { Connection } from '@jakguru/amqplib-oop'
import newrelic from 'newrelic'
const config = {} // Your RabbitMQ config
const connection = new Connection(config, {... your connection instrumentation hooks ...})
const queue = await connection.getQueue('your-queue-name-here', {...your queue options}, {
  preShutDown: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.preShutDown'),
  shutdown: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.shutdown'),
  check: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.check'),
  delete: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.delete'),
  purge: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.purge'),
  enqueue: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.enqueue'),
  ack: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.ack'),
  nack: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.nack'),
  get: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.get'),
  listen: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.listen'),
  pause: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.pause'),
  eventListener: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.eventListener'),
  eventEmitter: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.eventEmitter'),
  messageListener: newrelic.startBackgroundTransaction.bind(
    newrelic,
    'rabbitmq.messageListener'
  ),
  tick: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.tick'),
  consumer: newrelic.startBackgroundTransaction.bind(newrelic, 'rabbitmq.consumer'),
})
```

## TODO Eventually

- [ ] Add more test cases
- [ ] Add more documentation & examples
- [ ] Add "Exchange" functionality
