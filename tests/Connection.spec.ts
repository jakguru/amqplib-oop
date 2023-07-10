import { test } from '@japa/runner'
import type { ConnectionConstructorOptions } from '../src/Connection'
import { Connection } from '../src/Connection'
import { Queue } from '../src/Queue'

test.group('build.Connection', () => {
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

  test('can be instantiated', ({ assert }) => {
    const connection = new Connection(options)
    assert.instanceOf(connection, Connection)
    connection.close()
  })

  test('can generate a queue', async ({ assert }) => {
    const connection = new Connection(options)
    const queue = await connection.getQueue('test', {
      durable: false,
      autoDelete: true,
    })
    assert.instanceOf(queue, Queue)
    connection.close()
  })
})
