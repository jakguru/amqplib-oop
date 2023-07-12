import amqplib from 'amqplib'
import Emittery from 'eventemitter2'
import type { Instrumentor } from './Instrumentation'
import type { ConnectionChannel, QueueInstrumentors } from './Queue'
import { Queue } from './Queue'

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
    this.#bus = new Emittery({ maxListeners: 1000 })
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
  public $on(event: 'connected', listener: ConnectionEventListener): void
  /**
   * Registers an event listener for the specified event.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'error', listener: ConnectionErrorEventListener): void
  /**
   * Registers an event listener for the 'close' event.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'close', listener: ConnectionCloseEventListener): void
  /**
   * Registers an event listener for the 'blocked' event.
   * This event is emitted when the connection is blocked due to a flow control mechanism.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'blocked', listener: ConnectionEventListener): void
  /**
   * Registers an event listener for the 'unblocked' event.
   * This event is emitted when the connection is unblocked after being blocked due to a flow control mechanism.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'unblocked', listener: ConnectionEventListener): void
  /**
   * Registers an event listener for the 'before:close' event.
   * This event is emitted before the connection is closed.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $on(event: 'before:close', listener: ConnectionEventListener): void
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
  public $off(event: 'connected', listener: ConnectionEventListener): void
  /**
   * Removes the specified event listener for the 'error' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'error', listener: ConnectionErrorEventListener): void
  /**
   * Removes the specified event listener for the 'close' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'close', listener: ConnectionCloseEventListener): void
  /**
   * Removes the specified event listener for the 'blocked' event.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'blocked', listener: ConnectionEventListener): void
  /**
   * Removes the specified event listener for the 'unblocked' event.
   * This event is emitted when the connection is unblocked after being blocked due to a flow control mechanism.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'unblocked', listener: ConnectionEventListener): void
  /**
   * Removes the specified event listener for the 'before:close' event.
   * This event is emitted before the connection is closed.
   * @param event The name of the event to remove the listener from.
   * @param listener The function to be removed from the event listeners.
   * @returns void
   */
  public $off(event: 'before:close', listener: ConnectionEventListener): void
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
  public $once(event: 'connected', listener: ConnectionEventListener): void
  /**
   * Registers a one-time event listener for the 'error' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'error', listener: ConnectionErrorEventListener): void
  /**
   * Registers a one-time event listener for the 'close' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'close', listener: ConnectionCloseEventListener): void
  /**
   * Registers a one-time event listener for the 'blocked' event.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'blocked', listener: ConnectionEventListener): void
  /**
   * Registers a one-time event listener for the 'unblocked' event.
   * The listener is automatically removed after it has been called once.
   * This event is emitted when the connection is unblocked after being blocked due to a flow control mechanism.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'unblocked', listener: ConnectionEventListener): void
  /**
   * Registers a one-time event listener for the 'before:close' event.
   * This event is emitted before the connection is closed.
   * The listener is automatically removed after it has been called once.
   * @param event The name of the event to listen for.
   * @param listener The function to be called when the event is emitted.
   * @returns void
   */
  public $once(event: 'before:close', listener: ConnectionEventListener): void
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
      try {
        await connection.close()
      } catch (error) {
        if (
          'string' === typeof error.message &&
          error.message.includes('Connection closed (by client)')
        ) {
          // no-op
        } else {
          throw error
        }
      }
    })
  }

  /**
   * Checks the status of all queues associated with the connection.
   * @returns A `Promise` that resolves to an object containing the name of each queue and its status.
   * @throws An error if the connection is not established or if any of the queues cannot be checked.
   * @since 1.0.4
   */
  public async check(): Promise<ConnectionCheckResponse> {
    await this.#connection
    const promises: Array<Promise<ConnectionCheckResponse>> = []
    this.#queues.forEach((queue) => {
      promises.push(this.checkQueue(queue))
    })
    return Object.assign({}, ...(await Promise.all(promises))) as ConnectionCheckResponse
  }

  private async checkQueue(queue: Queue): Promise<ConnectionCheckResponse> {
    return { [queue.name]: await queue.check() }
  }
}

/**
 * Options for creating a new instance of a Connection object.
 * @remarks
 * This interface extends the `amqplib.Options.Connect` interface.
 */
export interface ConnectionConstructorOptions extends amqplib.Options.Connect {
  /**
   * The protocol to use for the connection (e.g. 'amqp' or 'amqps').
   */
  protocol?: string | undefined
  /**
   * The hostname of the server to connect to.
   */
  hostname?: string | undefined
  /**
   * The port number to connect to.
   */
  port?: number | undefined
  /**
   * The username to use for authentication.
   */
  username?: string | undefined
  /**
   * The password to use for authentication.
   */
  password?: string | undefined
  /**
   * The locale to use for the connection.
   */
  locale?: string | undefined
  /**
   * The maximum frame size to use for the connection.
   */
  frameMax?: number | undefined
  /**
   * The heartbeat interval to use for the connection.
   */
  heartbeat?: number | undefined
  /**
   * The virtual host to use for the connection.
   */
  vhost?: string | undefined
}

/**
 * Options for getting a queue from a channel.
 */
export interface ConnectionGetQueueOptions extends amqplib.Options.AssertQueue {
  /**
   * The type of the queue.
   */
  type: 'confirm' | 'basic'
  /**
   * Whether the queue should be exclusive to this connection.
   */
  exclusive?: boolean | undefined

  /**
   * Whether the queue should be durable (i.e. survive a broker restart).
   */
  durable?: boolean | undefined

  /**
   * Whether the queue should be automatically deleted when it has no more consumers.
   */
  autoDelete?: boolean | undefined

  /**
   * Additional arguments to pass when creating the queue.
   */
  arguments?: any

  /**
   * The time-to-live (TTL) for messages in the queue.
   */
  messageTtl?: number | undefined

  /**
   * The time in milliseconds after which the queue will be deleted.
   */
  expires?: number | undefined

  /**
   * The exchange to which messages will be sent if they are rejected or expire.
   */
  deadLetterExchange?: string | undefined

  /**
   * The routing key to use when sending messages to the dead letter exchange.
   */
  deadLetterRoutingKey?: string | undefined

  /**
   * The maximum number of messages that the queue can hold.
   */
  maxLength?: number | undefined

  /**
   * The maximum priority value for messages in the queue.
   */
  maxPriority?: number | undefined
}

/**
 * Options for asserting a queue on a channel.
 * @remarks
 * This interface extends the `amqplib.Options.AssertQueue` interface.
 */
export interface QueueAssertionOptions extends amqplib.Options.AssertQueue {
  /**
   * Whether the queue should be exclusive to this connection.
   */
  exclusive?: boolean | undefined

  /**
   * Whether the queue should be durable (i.e. survive a broker restart).
   */
  durable?: boolean | undefined

  /**
   * Whether the queue should be automatically deleted when it has no more consumers.
   */
  autoDelete?: boolean | undefined

  /**
   * Additional arguments to pass when creating the queue.
   */
  arguments?: any

  /**
   * The time-to-live (TTL) for messages in the queue.
   */
  messageTtl?: number | undefined

  /**
   * The time in milliseconds after which the queue will be deleted.
   */
  expires?: number | undefined

  /**
   * The exchange to which messages will be sent if they are rejected or expire.
   */
  deadLetterExchange?: string | undefined

  /**
   * The routing key to use when sending messages to the dead letter exchange.
   */
  deadLetterRoutingKey?: string | undefined

  /**
   * The maximum number of messages that the queue can hold.
   */
  maxLength?: number | undefined

  /**
   * The maximum priority value for messages in the queue.
   */
  maxPriority?: number | undefined
}

/**
 * An object containing instrumentors for various connection events.
 */
export interface ConnectionInstrumentors {
  /**
   * An instrumentor for the initialization event of the connection.
   */
  initialization: Instrumentor

  /**
   * An instrumentor for the getQueue event of the connection.
   */
  getQueue: Instrumentor

  /**
   * An instrumentor for the createChannel event of the connection.
   */
  createChannel: Instrumentor

  /**
   * An instrumentor for the assertQueue event of the connection.
   */
  assertQueue: Instrumentor

  /**
   * An instrumentor for the event listener of the connection.
   */
  eventListener: Instrumentor

  /**
   * An instrumentor for the event emitter of the connection.
   */
  eventEmitter: Instrumentor

  /**
   * An instrumentor for the shutdown event of the connection.
   */
  shutdown: Instrumentor
}

/**
 * Type for a generic event listener.
 * @callback EventListener
 * @param {...any[]} args - The arguments.
 * @returns {void | Promise<void>}
 */
export type ConnectionEventListener = (...args: any[]) => void | Promise<void>

/**
 * Type for an error event listener.
 * @callback ErrorEventListener
 * @param {Error} error - The error object.
 * @returns {void | Promise<void>}
 */
export type ConnectionErrorEventListener = (error: Error) => void | Promise<void>

/**
 * Type for an error event listener.
 * @callback ErrorEventListener
 * @param {Error} error - The error object.
 * @returns {void | Promise<void>}
 */
export type ConnectionCloseEventListener = (error?: Error) => void | Promise<void>

/**
 * An object representing the response of a connection check.
 * @interface ConnectionCheckResponse
 */
export interface ConnectionCheckResponse {
  /**
   * A key-value pair where the key is the name of the queue and the value is the response of the {@link Queue.check} method.
   * @type {Object.<string, amqplib.Replies.AssertQueue>}
   */
  [queue: string]: amqplib.Replies.AssertQueue
}
