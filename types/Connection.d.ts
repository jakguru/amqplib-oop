import type amqplib from 'amqplib'
import type { Instrumentor } from './Instrumentation'

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
