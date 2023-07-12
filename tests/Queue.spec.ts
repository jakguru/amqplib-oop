import { test } from '@japa/runner'
import type { ConnectionConstructorOptions } from '../src/Connection'
import { Connection } from '../src/Connection'
import { Queue } from '../src/Queue'

test.group('source.Queue', (group) => {
  group.teardown(async () => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    await queue.delete()
    connection.close()
  })

  const options: Partial<ConnectionConstructorOptions> = {
    protocol: process.env.PROTOCOL,
    hostname: process.env.HOSTNAME,
    port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
    username: process.env.USERNAME,
    password: process.env.PASSWORD,
    locale: process.env.LOCALE,
    frameMax: process.env.FRAMEMAX ? parseInt(process.env.FRAMEMAX) : undefined,
    heartbeat: process.env.HEARTBEAT ? parseInt(process.env.HEARTBEAT) : undefined,
    vhost: process.env.VHOST,
  }

  test('can be created', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    connection.close()
  })

  test('can be checked', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    const result = await queue.check()
    assert.isNotNull(result)
    connection.close()
  })

  test('can be deleted', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    const result = await queue.delete()
    assert.isNotNull(result)
    connection.close()
  })

  test('can be purged', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    const result = await queue.purge()
    assert.isNotNull(result)
    connection.close()
  })

  test('can manually enqueue messages, retrieve them and ack them', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    const message = await queue.get()
    assert.isNotFalse(message)
    if (false !== message) {
      assert.equal(message?.content.toString(), 'test')
      const ack = await queue.ack(message)
      assert.isNotNull(ack)
    }
    connection.close()
  })

  test('can manually enqueue messages, retrieve them and nack them to be requeued, and then can nack them without requeing', async ({
    assert,
  }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    await queue.purge()
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    const message = await queue.get()
    assert.isNotFalse(message)
    if (false !== message) {
      assert.equal(message?.content.toString(), 'test')
      const nack = await queue.nack(message, true)
      assert.isNotNull(nack)
      const message2 = await queue.get()
      assert.isNotFalse(message2)
      if (false !== message2) {
        assert.equal(message2?.content.toString(), 'test')
        const nack2 = await queue.nack(message2, false)
        assert.isNotNull(nack2)
      }
    }
    connection.close()
  })

  test('can consume and ack messages via a listener', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    queue.$on('error', console.error)
    connection.$on('error', console.error)
    assert.instanceOf(queue, Queue)
    await queue.purge()
    let passed = false
    const received: Promise<void> = new Promise((resolve) => {
      queue.listen((message, ack) => {
        assert.isNotNull(message)
        if (message) {
          assert.equal(message.content.toString(), 'test')
          passed = true
        }
        ack()
        resolve()
      })
    })
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    await received
    assert.isTrue(passed)
    connection.close()
  })

  test('can consume and ack messages via a non-blocking listener', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    queue.$on('error', console.error)
    connection.$on('error', console.error)
    assert.instanceOf(queue, Queue)
    await queue.purge()
    let count = 0
    const received: Promise<void> = new Promise((resolve) => {
      queue.listen(
        (message, ack) => {
          assert.isNotNull(message)
          if (message) {
            assert.equal(message.content.toString(), 'test')
            count++
          }
          ack()
          if (count === 5) {
            resolve()
          }
        },
        { blocking: false }
      )
    })
    await Promise.all([
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
    ])
    await received
    assert.equal(count, 5)
    connection.close()
  })

  /**
   * This test would simulate a situation where the connection to the queue is lost while trying to enqueue a message. The test should verify that the Queue class can handle this gracefully, either by retrying the operation, buffering the message for later, or throwing an appropriate exception.
   */
  test('can handle connection loss during enqueue', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      type: 'basic',
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    const aLotOfMessages = new Array(100).fill(Buffer.from('test'))
    const promise = Promise.all(
      aLotOfMessages.map((message) => queue.enqueue(message, { persistent: false }))
    )
    connection.close()
    const res = await promise
    assert.deepEqual(res, Array(100).fill(true))
  })

  /**
   * Similar to the above, but simulating a connection loss while trying to dequeue a message.
   */
  test('can handle connection loss during dequeue', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    await Promise.all([
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
    ])
    const message = await queue.get()
    assert.isNotFalse(message)
    connection.close()
    const messageAfterClose = await queue.get()
    assert.isFalse(messageAfterClose)
  })

  /**
   * This test would simulate a situation where the connection is lost while trying to acknowledge a message. The test should verify that the Queue class can handle this gracefully.
   */
  test('can handle connection loss during ack', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    await queue.purge()
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    const message = await queue.get()
    assert.isNotFalse(message)
    if (false !== message) {
      assert.equal(message?.content.toString(), 'test')
      connection.close()
      const ack = await queue.ack(message)
      assert.isUndefined(ack)
    }
  })

  /**
   * Similar to the above, but simulating a connection loss while trying to not acknowledge a message.
   */
  test('can handle connection loss during nack', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    await queue.purge()
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    const message = await queue.get()
    assert.isNotFalse(message)
    if (false !== message) {
      assert.equal(message?.content.toString(), 'test')
      connection.close()
      const ack = await queue.nack(message)
      assert.isUndefined(ack)
    }
  })
})
