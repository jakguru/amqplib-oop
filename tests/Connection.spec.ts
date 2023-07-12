import { test } from '@japa/runner'
import type { ConnectionConstructorOptions } from '../src/Connection'
import { Connection } from '../src/Connection'
import { Queue } from '../src/Queue'

test.group('build.Connection', (group) => {
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
    const queue = await connection.getQueue('test')
    await queue.delete()
    connection.close()
  })
  group.teardown(async () => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test')
    await queue.delete()
    connection.close()
  })
  let connection: Connection
  group.each.setup(async () => {
    connection = new Connection(options)
  })
  group.each.teardown(async () => {
    await connection.close()
  })
  group.each.timeout(1000)

  test('can generate a queue', async ({ assert }) => {
    const queue = await connection.getQueue('test')
    assert.instanceOf(queue, Queue)
  })
})
