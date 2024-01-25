import { test } from '@japa/runner'
import type { ConnectionConstructorOptions } from '../src/Connection'
import { Connection } from '../src/Connection'
import { Queue } from '../src/Queue'

test.group('source.Queue', (group) => {
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
  group.setup(async () => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', { type: 'basic' })
    await queue.delete()
    await connection.close()
  })
  group.teardown(async () => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', { type: 'basic' })
    await queue.delete()
    await connection.close()
    await Connection.closeAll()
  })
  let connection: Connection
  group.each.setup(async () => {
    connection = new Connection(options)
  })
  group.each.teardown(async () => {
    await connection.close()
  })
  group.each.timeout(1000)

  test('can be created', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    assert.instanceOf(queue, Queue)
  })

  test('can be checked', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    assert.instanceOf(queue, Queue)
    const result = await queue.check()
    assert.isNotNull(result)
  })

  test('can be deleted', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    assert.instanceOf(queue, Queue)
    const result = await queue.delete()
    assert.isNotNull(result)
  })

  test('can be purged', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    assert.instanceOf(queue, Queue)
    const result = await queue.purge()
    assert.isNotNull(result)
  })

  test('can manually enqueue messages, retrieve them and ack them', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
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
  })

  test('can manually enqueue messages, retrieve them and nack them to be requeued, and then can nack them without requeing', async ({
    assert,
  }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', { type: 'basic' })
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
  })

  test('can consume and ack messages via a listener', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
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
  })

  test('can consume and ack messages via a non-blocking listener', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
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
    const res = await queue.check()
    assert.equal(res.messageCount, 0)
  }).timeout(10000)

  /**
   * This test would simulate a situation where the connection to the queue is lost while trying to enqueue a message. The test should verify that the Queue class can handle this gracefully, either by retrying the operation, buffering the message for later, or throwing an appropriate exception.
   */
  test('can handle connection loss during enqueue', async ({ assert }) => {
    const queue = await connection.getQueue('test', {
      type: 'basic',
    })
    assert.instanceOf(queue, Queue)
    const aLotOfMessages = new Array(100).fill(Buffer.from('test'))
    const promise = Promise.all(
      aLotOfMessages.map((message) => queue.enqueue(message, { persistent: false }))
    )
    const res = await promise
    assert.deepEqual(res, Array(100).fill(true))
  })

  /**
   * Similar to the above, but simulating a connection loss while trying to dequeue a message.
   */
  test('can handle connection loss during dequeue', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
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
    await connection.close()
    const messageAfterClose = await queue.get()
    assert.isFalse(messageAfterClose)
  })

  /**
   * This test would simulate a situation where the connection is lost while trying to acknowledge a message. The test should verify that the Queue class can handle this gracefully.
   */
  test('can handle connection loss during ack', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    assert.instanceOf(queue, Queue)
    await queue.purge()
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    const message = await queue.get()
    assert.isNotFalse(message)
    if (false !== message) {
      assert.equal(message?.content.toString(), 'test')
      await connection.close()
      const ack = await queue.ack(message)
      assert.isUndefined(ack)
    }
  })

  /**
   * Similar to the above, but simulating a connection loss while trying to not acknowledge a message.
   */
  test('can handle connection loss during nack', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    assert.instanceOf(queue, Queue)
    await queue.purge()
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    const message = await queue.get()
    assert.isNotFalse(message)
    if (false !== message) {
      assert.equal(message?.content.toString(), 'test')
      await connection.close()
      const ack = await queue.nack(message)
      assert.isUndefined(ack)
    }
  })

  test('pausing a queue will wait for all confirmations to be processed', async ({ assert }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
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
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
      queue.enqueue(Buffer.from('test'), { persistent: false }),
    ])
    await received
    await queue.pause()
    const { messageCount } = await queue.check()
    assert.equal(messageCount, 45)
  }).timeout(5000)

  test('can consume and ack messages via consumption, and then can stop when an abort signal is sent', async ({
    assert,
  }) => {
    const queue = await connection.getQueue('test', { type: 'basic' })
    queue.$on('error', console.error)
    connection.$on('error', console.error)
    assert.instanceOf(queue, Queue)
    await queue.purge()
    let passed = false
    const abortController = new AbortController()
    const received: Promise<void> = new Promise((resolve) => {
      queue.consume(
        (message, ack) => {
          assert.equal(message.content.toString(), 'test')
          passed = true
          ack()
          resolve()
        },
        {},
        abortController.signal
      )
    })
    const result = await queue.enqueue(Buffer.from('test'), { persistent: false })
    assert.isNotNull(result)
    await received
    abortController.abort()
    assert.isTrue(passed)
  })
})
