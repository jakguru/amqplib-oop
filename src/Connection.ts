import amqplib from 'amqplib'
import Emittery from 'eventemitter2'

/**
 * Imports the necessary types and classes for the Connection class.
 * @typedef {import('../types/Connection').ConnectionConstructorOptions} ConnectionConstructorOptions
 * @typedef {import('../types/Connection').ConnectionGetQueueOptions} ConnectionGetQueueOptions
 * @typedef {import('../types/Connection').QueueAssertionOptions} QueueAssertionOptions
 * @typedef {import('./Queue').Queue} Queue
 * @typedef {import('../types/Connection').ConnectionInstrumentors} ConnectionInstrumentors
 */
import type {
  ConnectionConstructorOptions,
  ConnectionGetQueueOptions,
  ConnectionInstrumentors,
  QueueAssertionOptions,
} from '../types/Connection'

import { Queue } from './Queue'

import type { ConnectionChannel, QueueInstrumentors } from '../types/Queue'

/**
 * @class Connection
 * @classdesc An instance of a connection to a RabbitMQ server
 */
export class Connection {
  /**
   * A `Promise` that resolves to a `amqplib.Connection` instance representing the connection to the RabbitMQ server.
   * @private
   */
  readonly #connection: Promise<amqplib.Connection>

  /**
   * An instance of `Emittery` used to emit and listen to events related to the connection.
   * @private
   */
  readonly #bus: Emittery

  /**
   * A `Map` containing all the `Queue` instances created by this `Connection` instance, indexed by their name.
   * @private
   */
  readonly #queues: Map<string, Queue> = new Map()

  readonly #instrumentors: ConnectionInstrumentors

  /**
   * @class Connection
   * @classdesc An instance of a connection to a RabbitMQ server.
   * @param options Optional configuration options for the connection.
   * @param debug Whether to enable debug logging for event buses used by this connection.
   * @param instrumentors Optional instrumentors for various connection operations.
   */
  constructor(
    options: Partial<ConnectionConstructorOptions>,
    instrumentors?: Partial<ConnectionInstrumentors>
  ) {
    const defaultOptions: ConnectionConstructorOptions = {
      protocol: 'amqp',
      hostname: 'localhost',
      port: 5672,
      username: 'guest',
      password: 'guest',
      locale: 'en_US',
      frameMax: 0,
      heartbeat: 0,
      vhost: '/',
    }
    const defaultInstrumentors: ConnectionInstrumentors = {
      initialization: (handle) => handle(),
      getQueue: (handle) => handle(),
      createChannel: (handle) => handle(),
      assertQueue: (handle) => handle(),
      eventListener: (handle) => handle(),
      eventEmitter: (handle) => handle(),
      shutdown: (handle) => handle(),
    }
    this.#instrumentors = Object.assign(
      {},
      defaultInstrumentors,
      instrumentors
    ) as ConnectionInstrumentors
    this.#bus = new Emittery()
    const mergedOptions = Object.assign({}, defaultOptions, options) as ConnectionConstructorOptions
    this.#connection = this.#instrumentors.initialization(async () => {
      return await amqplib.connect(mergedOptions)
    })
    this.#connection.then((connection) => {
      this.#instrumentors.eventEmitter(() => {
        this.#bus.emit('connected')
      })
      connection.on(
        'error',
        this.#instrumentors.eventEmitter.bind(null, this.#bus.emit.bind(this.#bus, 'error'))
      )
      connection.on(
        'close',
        this.#instrumentors.eventEmitter.bind(null, this.#bus.emit.bind(this.#bus, 'close'))
      )
      connection.on(
        'blocked',
        this.#instrumentors.eventEmitter.bind(null, this.#bus.emit.bind(this.#bus, 'blocked'))
      )
      connection.on(
        'unblocked',
        this.#instrumentors.eventEmitter.bind(null, this.#bus.emit.bind(this.#bus, 'unblocked'))
      )
    })
  }

  /**
   * Returns a `Promise` that resolves to a `Queue` instance with the specified `name`.
   * If a `Queue` instance with the specified `name` was already created by the instance of the connection, it is returned instead, allowing you to re-use an existing connection channel.
   * @param name The name of the queue to get or create.
   * @param options Optional configuration options for the queue.
   * @returns A `Promise` that resolves to a `Queue` instance.
   * @throws An error if the queue could not be created / updated on the server.
   */
  public async getQueue(
    name: string,
    options?: Partial<ConnectionGetQueueOptions>,
    instrumentors?: Partial<QueueInstrumentors>
  ): Promise<Queue> {
    return await this.#instrumentors.getQueue(async () => {
      if (this.#queues.has(name)) {
        const ret = this.#queues.get(name)
        if (ret) {
          return ret
        }
      }
      const defaultOptions: ConnectionGetQueueOptions = {
        type: 'confirm',
        exclusive: false,
        durable: true,
        autoDelete: false,
      }
      const mergedOptions = Object.assign({}, defaultOptions, options) as ConnectionGetQueueOptions
      const queueOptions = Object.assign({}, mergedOptions, {
        type: undefined,
      }) as QueueAssertionOptions
      const connection = await this.#connection
      const channel: ConnectionChannel = await this.#instrumentors.createChannel(async () => {
        if ('confirm' === mergedOptions.type) {
          return await connection.createConfirmChannel()
        } else {
          return await connection.createChannel()
        }
      })
      const assertion = await channel.assertQueue(name, queueOptions)
      if (assertion.queue !== name) {
        throw new Error('Failed to define Queue')
      }
      const queue = new Queue(name, this, channel, mergedOptions.type, instrumentors)
      queue.$once('deleted', this.#queues.delete.bind(this.#queues, name))
      this.#queues.set(name, queue)
      return queue
    })
  }

  /**
   * Registers an event listener for the 'connected' event.
   * This event is emitted when the connection is established.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'connected', listener: () => void | Promise<void>): void
  /**
   * Registers an event listener for the specified event.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'error', listener: (error: Error) => void | Promise<void>): void
  /**
   * Registers an event listener for the 'close' event.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'close', listener: (error?: Error) => void | Promise<void>): void
  /**
   * Registers an event listener for the 'blocked' event.
   * This event is emitted when the connection is blocked due to a flow control mechanism.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'blocked', listener: () => void | Promise<void>): void
  /**
   * Registers an event listener for the 'unblocked' event.
   * This event is emitted when the connection is unblocked after being blocked due to a flow control mechanism.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'unblocked', listener: () => void | Promise<void>): void
  /**
   * Registers an event listener for the 'before:close' event.
   * This event is emitted before the connection is closed.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'before:close', listener: () => void | Promise<void>): void
  /**
   * Registers an event listener for the specified event.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: string, listener: (...args: any[]) => void | Promise<void>): void {
    this.#bus.on(event, this.#instrumentors.eventListener.bind(null, listener))
  }

  /**
   * Removes the specified event listener for the 'connected' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'connected', listener: () => void | Promise<void>): void
  /**
   * Removes the specified event listener for the 'error' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'error', listener: (error: Error) => void | Promise<void>): void
  /**
   * Removes the specified event listener for the 'close' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'close', listener: (error?: Error) => void | Promise<void>): void
  /**
   * Removes the specified event listener for the 'blocked' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'blocked', listener: () => void | Promise<void>): void
  /**
   * Removes the specified event listener for the 'unblocked' event.
   * This event is emitted when the connection is unblocked after being blocked due to a flow control mechanism.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'unblocked', listener: () => void | Promise<void>): void
  /**
   * Removes the specified event listener for the 'before:close' event.
   * This event is emitted before the connection is closed.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'before:close', listener: () => void | Promise<void>): void
  /**
   * Removes the specified event listener for the specified event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: string, listener: (...args: any[]) => void | Promise<void>): void {
    this.#bus.off(event, listener)
  }

  /**
   * Registers a one-time event listener for the 'connected' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'connected', listener: () => void | Promise<void>): void
  /**
   * Registers a one-time event listener for the 'error' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'error', listener: (error: Error) => void | Promise<void>): void
  /**
   * Registers a one-time event listener for the 'close' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'close', listener: (error?: Error) => void | Promise<void>): void
  /**
   * Registers a one-time event listener for the 'blocked' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'blocked', listener: () => void | Promise<void>): void
  /**
   * Registers a one-time event listener for the 'unblocked' event.
   * The listener is automatically removed after it has been called once.
   * This event is emitted when the connection is unblocked after being blocked due to a flow control mechanism.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'unblocked', listener: () => void | Promise<void>): void
  /**
   * Registers a one-time event listener for the 'before:close' event.
   * This event is emitted before the connection is closed.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'before:close', listener: () => void | Promise<void>): void
  /**
   * Registers a one-time event listener for the specified event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: string, listener: (...args: any[]) => void | Promise<void>): void {
    this.#bus.once(event, this.#instrumentors.eventListener.bind(null, listener))
  }

  /**
   * Closes the connection to the RabbitMQ server.
   *
   * @returns A `Promise` that resolves when the connection has been closed.
   * @throws An error if the connection could not be closed.
   */
  public async close(): Promise<void> {
    return await this.#instrumentors.shutdown(async () => {
      const connection = await this.#connection
      await this.#bus.emitAsync('before:close')
      await connection.close()
    })
  }
}
