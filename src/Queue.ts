import amqplib from 'amqplib'
import Emittery from 'eventemitter2'
import type { Connection } from './Connection'
import type { Instrumentor } from './Instrumentation'
export type { Channel, ConfirmChannel } from 'amqplib'

import ConnectionError from './Errors/ConnectionError'
import QueueError from './Errors/QueueError'

/**
 * An instance of a Queue which is connected to either a regular `amqplib.Channel` or a `amqplib.ConfirmChannel`.
 * @class Queue
 */
export class Queue {
  readonly #name: string
  readonly #client: Connection
  readonly #channel: ConnectionChannel
  readonly #type: 'confirm' | 'basic'
  readonly #bus: Emittery
  readonly #instrumentors: QueueInstrumentors
  readonly #allTickPromises: Promise<void>[] = []
  #paused: boolean = true
  #lastTickPromise?: Promise<void>
  #blocking: boolean = true
  #ackOnNoAck: boolean = false
  #nackOnNoAck: boolean = true
  #requeueOnNoAck: boolean = true
  #noAck: boolean = false
  #requeueOnError: boolean = true

  /**
   * Creates an instance of a Queue which is connected to either a regular `amqplib.Channel` or a `amqplib.ConfirmChannel`.
   * @constructor
   * @param {string} name - The name of the queue.
   * @param {Connection} client - The connection client.
   * @param {ConnectionChannel} channel - The connection channel.
   * @param {'confirm' | 'basic'} type - The type of the channel.
   * @param {boolean} [debug=false] - Whether to enable debug mode.
   * @param {Partial<QueueInstrumentors>} [instrumentors] - Optional instrumentors for the queue.
   */
  constructor(
    name: string,
    client: Connection,
    channel: ConnectionChannel,
    type: 'confirm' | 'basic',
    instrumentors?: Partial<QueueInstrumentors>
  ) {
    this.#name = name
    this.#client = client
    this.#channel = channel
    this.#type = type
    this.#bus = new Emittery()
    const defaultInstrumentors: QueueInstrumentors = {
      preShutDown: (handle) => handle(),
      shutdown: (handle) => handle(),
      check: (handle) => handle(),
      delete: (handle) => handle(),
      purge: (handle) => handle(),
      enqueue: (handle) => handle(),
      ack: (handle) => handle(),
      nack: (handle) => handle(),
      get: (handle) => handle(),
      listen: (handle) => handle(),
      pause: (handle) => handle(),
      eventListener: (handle) => handle(),
      eventEmitter: (handle) => handle(),
      messageListener: (handle) => handle(),
      tick: (handle) => handle(),
      consumer: (handle) => handle(),
    }
    this.#instrumentors = Object.assign(
      {},
      defaultInstrumentors,
      instrumentors
    ) as QueueInstrumentors
    this.#client.$once('before:close', this.#doBeforeClientClose.bind(this))
  }

  /**
   * Checks the queue for messages and returns the number of messages in the queue.
   * @returns {Promise<amqplib.Replies.AssertQueue>} - A promise that resolves with the result of checking the queue.
   */
  public async check(): Promise<amqplib.Replies.AssertQueue> {
    return await this.#instrumentors.check(async () => {
      return await this.#doWithErrorHandler(async () => {
        return this.#channel.checkQueue(this.#name)
      })
    })
  }

  /**
   * Deletes the queue with the given options.
   * @param {Partial<amqplib.Options.DeleteQueue>} options - The options to use when deleting the queue.
   * @returns {Promise<amqplib.Replies.DeleteQueue>} - A promise that resolves with the result of deleting the queue.
   */
  public async delete(
    options?: Partial<amqplib.Options.DeleteQueue>
  ): Promise<amqplib.Replies.DeleteQueue> {
    return this.#instrumentors.delete(async () => {
      return await this.#doWithErrorHandler(async () => {
        const defaultOptions: amqplib.Options.DeleteQueue = {
          ifEmpty: false,
          ifUnused: false,
        }
        const mergedOptions = Object.assign(
          {},
          defaultOptions,
          options
        ) as amqplib.Options.DeleteQueue
        const ret = await this.#channel.deleteQueue(this.#name, mergedOptions)
        this.#bus.emit('deleted')
        return ret
      })
    })
  }

  /**
   * Purges the queue, removing all messages from it.
   * @returns {Promise<amqplib.Replies.PurgeQueue>} - A promise that resolves with the result of purging the queue.
   */
  public async purge(): Promise<amqplib.Replies.PurgeQueue> {
    return this.#instrumentors.purge(async () => {
      return this.#doWithErrorHandler(async () => {
        return this.#channel.purgeQueue(this.#name)
      })
    })
  }

  /**
   * Enqueues a message to the queue with the given content and options.
   * @param {Buffer} content - The content of the message to enqueue.
   * @param {Partial<QueueEnqueueOptions>} options - The options to use when enqueuing the message.
   * @returns {Promise<boolean>} - A promise that resolves with a boolean indicating whether the message was successfully enqueued.
   */
  public async enqueue(content: Buffer, options?: Partial<QueueEnqueueOptions>): Promise<boolean> {
    return this.#instrumentors.enqueue(async () => {
      const defaultOptions: QueueEnqueueOptions = {
        persistent: true,
      }
      const mergedOptions = Object.assign({}, defaultOptions, options) as QueueEnqueueOptions
      return await this.#doWithErrorHandler(async () => {
        if ('confirm' === this.#type) {
          return await new Promise((resolve) => {
            this.#channel.sendToQueue(this.#name, content, mergedOptions, (err) => {
              if (err) {
                resolve(false)
              } else {
                resolve(true)
              }
            })
          })
        } else {
          return await this.#channel.sendToQueue(this.#name, content, mergedOptions)
        }
      })
    })
  }

  /**
   * Acknowledges a message, indicating that it has been successfully processed and can be removed from the queue.
   * @param {QueueMessage} message - The message to acknowledge.
   * @param {boolean} [allUpTo] - Whether to acknowledge all messages up to and including the given message.
   * @returns {void}
   */
  public ack(message: QueueMessage, allUpTo?: boolean): void {
    return this.#instrumentors.ack(() => {
      this.#channel.ack(message, allUpTo)
    })
  }

  /**
   * Rejects a message, indicating that it has not been successfully processed and should be requeued or discarded.
   * @param {QueueMessage} message - The message to reject.
   * @param {boolean} [requeue=true] - Whether to requeue the message or discard it.
   * @param {boolean} [allUpTo=false] - Whether to reject all messages up to and including the given message.
   * @returns {void}
   */
  public nack(message: QueueMessage, requeue: boolean = true, allUpTo: boolean = false): void {
    return this.#instrumentors.nack(() => {
      this.#channel.nack(message, allUpTo, requeue)
    })
  }

  /**
   * Retrieves a message from the queue with the given options.
   * @param {Partial<GetMessagesOptions>} options - The options to use when retrieving the message.
   * @returns {Promise<QueueMessage | false>} - A promise that resolves with the retrieved message or `false` if no message is available.
   */
  public async get(options?: Partial<GetMessagesOptions>): Promise<QueueMessage | false> {
    return this.#instrumentors.get(async () => {
      const defaultOptions: GetMessagesOptions = {
        noAck: false,
      }
      const mergedOptions = Object.assign({}, defaultOptions, options) as GetMessagesOptions
      return await this.#channel.get(this.#name, mergedOptions)
    })
  }

  /**
   * Listens for messages on the queue, invoking the given listener function for each message received.
   * @param {QueueMessageListener} [listener] - The function to invoke for each message received.
   * @param {Partial<QueueListeningOptions>} [options] - The options to use when listening for messages.
   * @throws {Error} - Throws an error if `noAck`, `ackOnNoAck`, and `nackOnNoAck` are all `false`.
   * @returns {Promise<void>} - A promise that resolves when the listener has been started.
   */
  public async listen(
    listener?: QueueMessageListener,
    options?: Partial<QueueListeningOptions>
  ): Promise<void> {
    return await this.#instrumentors.listen(async () => {
      const defaultOptions: QueueListeningOptions = {
        blocking: true,
        ackOnNoAck: false,
        nackOnNoAck: true,
        noAck: false,
        requeueOnError: true,
        requeueOnNoAck: true,
      }
      const mergedOptions = Object.assign({}, defaultOptions, options) as QueueListeningOptions
      const { blocking, ackOnNoAck, nackOnNoAck, noAck, requeueOnError, requeueOnNoAck } =
        mergedOptions
      if (false === noAck && false === ackOnNoAck && false === nackOnNoAck) {
        throw new Error('noAck, ackOnNoAck and nackOnNoAck cannot all be false')
      }
      if (true === requeueOnNoAck && false === nackOnNoAck) {
        process.emitWarning('requeueOnNoAck is ignored because nackOnNoAck is false')
      }
      this.#blocking = blocking
      this.#ackOnNoAck = ackOnNoAck
      this.#nackOnNoAck = nackOnNoAck
      this.#noAck = noAck
      this.#requeueOnError = requeueOnError
      this.#requeueOnNoAck = requeueOnNoAck
      await this.#waitForTicksToFinish()
      if (listener) {
        this.#bus.on('message', this.#handleListener.bind(this, listener))
      }
      if (this.#paused) {
        this.#paused = false
      }
      this.#allTickPromises.push(this.#doTick())
    })
  }

  /**
   * Pauses the queue listener, preventing it from processing any new messages until resumed.
   * If the queue is already paused, this method does nothing.
   * @returns {Promise<void>} - A promise that resolves when the queue has been successfully paused.
   */
  public async pause(): Promise<void> {
    return this.#instrumentors.pause(async () => {
      if (this.#paused) {
        return
      }
      this.#paused = true
      await this.#waitForTicksToFinish()
      while (this.#allTickPromises.length) {
        this.#allTickPromises.splice(0, this.#allTickPromises.length)
      }
    })
  }

  /**
   * Registers an event listener for the 'error' event.
   * @param {string} event - The name of the event to listen for ('error').
   * @param {QueueErrorEventListener} listener - The function to invoke when the 'error' event is emitted.
   * @returns {void}
   */
  public $on(event: 'error', listener: QueueErrorEventListener): void

  /**
   * Registers an event listener for the 'deleted' event.
   * @param {string} event - The name of the event to listen for ('deleted').
   * @param {QueueDeletedEventListener} listener - The function to invoke when the 'deleted' event is emitted.
   * @returns {void}
   */
  public $on(event: 'deleted', listener: QueueDeletedEventListener): void

  /**
   * Registers an event listener for the 'message' event.
   * @param {string} event - The name of the event to listen for ('message').
   * @param {QueueMessageListener} listener - The function to invoke when the 'message' event is emitted.
   * @returns {void}
   */
  public $on(event: 'message', listener: QueueMessageListener): void

  /**
   * Registers an event listener for the specified event.
   * @param {string} event - The name of the event to listen for.
   * @param {QueueGenericEventListener} listener - The function to invoke when the event is emitted.
   * @returns {void}
   */
  public $on(event: string, listener: QueueGenericEventListener): void {
    if ('message' === event) {
      this.#bus.on(
        'message',
        this.#instrumentors.eventListener.bind(null, this.#handleListener.bind(this, listener))
      )
    } else {
      this.#bus.on(event, this.#instrumentors.eventListener.bind(null, listener))
    }
  }

  /**
   * Removes the specified event listener for the 'error' event.
   * @param {string} event - The name of the event to remove the listener from ('error').
   * @param {QueueErrorEventListener} listener - The function to remove as a listener for the 'error' event.
   * @returns {void}
   */
  public $off(event: 'error', listener: QueueErrorEventListener): void
  /**
   * Removes the specified event listener for the 'deleted' event.
   * @param {string} event - The name of the event to remove the listener from ('deleted').
   * @param {QueueDeletedEventListener} listener - The function to remove as a listener for the 'deleted' event.
   * @returns {void}
   */
  public $off(event: 'deleted', listener: QueueDeletedEventListener): void
  /**
   * Removes the specified event listener for the 'message' event.
   * @param {string} event - The name of the event to remove the listener from ('message').
   * @param {QueueMessageListener} listener - The function to remove as a listener for the 'message' event.
   * @returns {void}
   */
  public $off(event: 'message', listener: QueueMessageListener): void
  /**
   * Removes the specified event listener for the given event.
   * @param {string} event - The name of the event to remove the listener from.
   * @param {QueueGenericEventListener} listener - The function to remove as a listener for the event.
   * @returns {void}
   */
  public $off(event: string, listener: QueueGenericEventListener): void {
    if ('message' === event) {
      this.#bus.off(
        'message',
        this.#instrumentors.eventListener.bind(null, this.#handleListener.bind(this, listener))
      )
    } else {
      this.#bus.off(event, this.#instrumentors.eventListener.bind(null, listener))
    }
  }

  /**
   * Registers a one-time event listener for the 'error' event.
   * The listener will be invoked at most once for the event, and then removed.
   * @param {string} event - The name of the event to listen for ('error').
   * @param {QueueErrorEventListener} listener - The function to invoke when the 'error' event is emitted.
   * @returns {void}
   */
  public $once(event: 'error', listener: QueueErrorEventListener): void
  /**
   * Registers a one-time event listener for the 'deleted' event.
   * The listener will be invoked at most once for the event, and then removed.
   * @param {string} event - The name of the event to listen for ('deleted').
   * @param {QueueDeletedEventListener} listener - The function to invoke when the 'deleted' event is emitted.
   * @returns {void}
   */
  public $once(event: 'deleted', listener: QueueDeletedEventListener): void
  /**
   * Registers a one-time event listener for the 'message' event.
   * The listener will be invoked at most once for the event, and then removed.
   * @param {string} event - The name of the event to listen for ('message').
   * @param {QueueMessageListener} listener - The function to invoke when the 'message' event is emitted.
   * @returns {void}
   */
  public $once(event: 'message', listener: QueueMessageListener): void
  /**
   * Registers a one-time event listener for the specified event.
   * The listener will be invoked at most once for the event, and then removed.
   * @param {string} event - The name of the event to listen for.
   * @param {QueueGenericEventListener} listener - The function to invoke when the event is emitted.
   * @returns {void}
   */
  public $once(event: string, listener: QueueGenericEventListener): void {
    if ('message' === event) {
      this.#bus.once(
        'message',
        this.#instrumentors.eventListener.bind(null, this.#handleListener.bind(this, listener))
      )
    } else {
      this.#bus.once(event, this.#instrumentors.eventListener.bind(null, listener))
    }
  }

  /**
   * Handles the invocation of a message listener for a tick message.
   * @param {QueueMessageListener} listener - The listener function to invoke.
   * @param {TickMessage} tickMessage - The tick message containing the message to process.
   * @returns {Promise<void>} - A Promise that resolves when the listener has finished processing the message.
   */
  async #handleListener(listener: QueueMessageListener, tickMessage: TickMessage): Promise<void> {
    const { message, ack, nack } = tickMessage
    return this.#instrumentors.messageListener(async () => {
      return await listener.apply(null, [message, ack, nack])
    })
  }

  /**
   * Executes a single tick of the queue, either by performing a blocking request or a non-blocking request.
   * If the queue is paused, this method will not execute.
   * @returns {Promise<void>} - A Promise that resolves when the tick has completed.
   */
  async #doTick(): Promise<void> {
    return await this.#instrumentors.tick(async () => {
      if (!this.#paused) {
        if (this.#blocking) {
          await this.#waitForTicksToFinish()
        }
        await this.#doTickRequest()
      }
      if (!this.#paused) {
        process.nextTick(() => {
          this.#allTickPromises.push(this.#doTick())
        })
      }
    })
  }

  /**
   * Executes a single tick of the queue by performing a blocking request.
   * If a message is received, it is passed to the registered message listeners.
   * If the message is not acknowledged or rejected by the listeners, it is either acknowledged or rejected based on the queue's configuration.
   * If an error occurs while processing the message, the error is emitted to the error event and the message is either rejected or requeued based on the queue's configuration.
   * @returns {Promise<void>} - A Promise that resolves when the tick has completed.
   */
  async #doTickRequest(): Promise<void> {
    const message = await this.#channel.get(this.#name, { noAck: this.#noAck })
    if (message) {
      let responded = false
      const messageBus = new Emittery()
      const sendAck = this.ack.bind(this, message)
      const sendNack = this.nack.bind(this, message)
      messageBus.on('ack', (args) => {
        if (!responded && !this.#noAck) {
          responded = true
          sendAck(...args)
        }
      })
      messageBus.on('nack', (args) => {
        if (!responded && !this.#noAck) {
          responded = true
          sendNack(...args)
        }
      })
      const ack = (allUpTo?: boolean) => {
        messageBus.emit('ack', [allUpTo])
      }
      const nack = (requeue?: boolean, allUpTo?: boolean) => {
        messageBus.emit('nack', [requeue, allUpTo])
      }
      try {
        await this.#instrumentors.consumer(async () => {
          const res = await this.#bus.emitAsync('message', {
            message,
            ack,
            nack,
          })
          if (res instanceof Error) {
            throw res
          }
        })
      } catch (err) {
        this.#bus.emit('error', err)
        if (this.#requeueOnError) {
          nack(true)
        }
      }
      if (!responded && !this.#noAck) {
        if (this.#ackOnNoAck) {
          ack()
        } else if (this.#nackOnNoAck) {
          nack(this.#requeueOnNoAck)
        }
      }
    }
  }

  /**
   * Closes the channel and emits a 'deleted' event on the bus.
   * @returns {Promise<void>} - A Promise that resolves when the channel is closed and the 'deleted' event is emitted.
   */
  async #doBeforeClientClose(): Promise<void> {
    return await this.#instrumentors.preShutDown(async () => {
      await this.pause()
      await this.#channel.close()
      this.#bus.emit('deleted')
    })
  }

  async #doWithErrorHandler(handle: Function) {
    const queueErrorPromise = new Promise((resolve) => {
      this.#bus.once('error', (e) => {
        const err = new QueueError(e.message)
        resolve(err)
      })
    })
    const connectionErrorPromise = new Promise((resolve) => {
      this.#client.$once('error', (e) => {
        const err = new ConnectionError(e.message)
        resolve(err)
      })
    })
    return await Promise.race([handle(), queueErrorPromise, connectionErrorPromise])
  }

  async #waitForTicksToFinish() {
    const promises = [...this.#allTickPromises]
    if (this.#lastTickPromise) {
      promises.push(this.#lastTickPromise)
    }
    await Promise.all(promises)
  }
}

/**
 * A type alias for a channel that can be either a regular `amqplib.Channel` or a `amqplib.ConfirmChannel`.
 * @interface
 */
export type ConnectionChannel = amqplib.Channel | amqplib.ConfirmChannel

/**
 * Options for enqueuing a message to a queue.
 */
/**
 * Options for enqueuing a message to a queue.
 * @interface
 * @extends {amqplib.Options.Publish}
 */
export interface QueueEnqueueOptions extends amqplib.Options.Publish {
  /**
   * The time in milliseconds after which the message will expire.
   */
  expiration?: string | number | undefined
  /**
   * The user ID of the message sender.
   */
  userId?: string | undefined
  /**
   * The CC (carbon copy) address(es) for the message.
   */
  CC?: string | string[] | undefined
  /**
   * Whether the message is mandatory.
   */
  mandatory?: boolean | undefined
  /**
   * Whether the message should be persisted.
   */
  persistent?: boolean | undefined
  /**
   * The delivery mode of the message.
   */
  deliveryMode?: boolean | number | undefined
  /**
   * The BCC (blind carbon copy) address(es) for the message.
   */
  BCC?: string | string[] | undefined
  /**
   * The content type of the message.
   */
  contentType?: string | undefined
  /**
   * The content encoding of the message.
   */
  contentEncoding?: string | undefined
  /**
   * The headers of the message.
   */
  headers?: any
  /**
   * The priority of the message.
   */
  priority?: number | undefined
  /**
   * The correlation ID of the message.
   */
  correlationId?: string | undefined
  /**
   * The reply-to address for the message.
   */
  replyTo?: string | undefined
  /**
   * The message ID.
   */
  messageId?: string | undefined
  /**
   * The timestamp of the message.
   */
  timestamp?: number | undefined
  /**
   * The type of the message.
   */
  type?: string | undefined
  /**
   * The application ID of the message.
   */
  appId?: string | undefined
}

/**
 * A message fetched from the queue
 */
/**
 * A message fetched from the queue, with additional fields for message count, delivery tag, redelivery status, exchange, and routing key.
 * @interface
 * @extends {amqplib.GetMessage}
 */
export interface QueueMessage extends amqplib.GetMessage {
  /**
   * The content of the message as a Buffer.
   */
  content: Buffer
  /**
   * An object containing additional fields for message count, delivery tag, redelivery status, exchange, and routing key.
   */
  fields: {
    /**
     * The number of messages in the queue.
     */
    messageCount: number
    /**
     * The delivery tag of the message.
     */
    deliveryTag: number
    /**
     * Whether the message has been redelivered.
     */
    redelivered: boolean
    /**
     * The exchange the message was published to.
     */
    exchange: string
    /**
     * The routing key used to publish the message.
     */
    routingKey: string
  }

  /**
   * An object containing additional properties for the message.
   */
  properties: {
    /**
     * The content type of the message.
     */
    contentType: any | undefined
    /**
     * The content encoding of the message.
     */
    contentEncoding: any | undefined
    /**
     * The headers of the message.
     */
    headers: {
      /**
       * The number of times the message has been redelivered.
       */
      'x-first-death-exchange'?: string | undefined
      /**
       * The exchange the message was published to.
       */
      'x-first-death-queue'?: string | undefined
      /**
       * The routing key used to publish the message.
       */
      'x-first-death-reason'?: string | undefined
      /**
       * The time the message was first published.
       */
      'x-death'?: XDeath[] | undefined
      [key: string]: any
    }
    /**
     * The delivery mode of the message.
     */
    deliveryMode: any | undefined
    /**
     * The priority of the message.
     */
    priority: any | undefined
    /**
     * The correlation ID of the message.
     */
    correlationId: any | undefined
    /**
     * The reply-to address for the message.
     */
    replyTo: any | undefined
    /**
     * The expiration time of the message.
     */
    expiration: any | undefined
    /**
     * The message ID.
     */
    messageId: any | undefined
    /**
     * The timestamp of the message.
     */
    timestamp: any | undefined
    /**
     * The type of the message.
     */
    type: any | undefined
    /**
     * The user ID of the message sender.
     */
    userId: any | undefined
    /**
     * The application ID of the message.
     */
    appId: any | undefined
    /**
     * The cluster ID of the message.
     */
    clusterId: any | undefined
  }
}

/**
 * Options for getting messages from a queue.
 */
/**
 * Options for getting messages from a queue.
 * @interface
 * @extends {amqplib.Options.Get}
 */
export interface GetMessagesOptions extends amqplib.Options.Get {
  /**
   * Whether to automatically acknowledge the message upon retrieval.
   */
  noAck?: boolean | undefined
}

/**
 * A function that acknowledges the successful processing of a message from a queue.
 * @interface
 */
export interface QueueSuccessAcknowledgement extends Function {
  /**
   * Acknowledges the successful processing of a message from a queue.
   * @param allUpTo - If `true`, acknowledges all messages up to and including the current message.
   */
  (allUpTo?: boolean): void
}

/**
 * A function that negatively acknowledges the processing of a message from a queue.
 * @interface
 * @extends {QueueSuccessAcknowledgement}
 */
export interface QueueFailureAcknowledgement extends QueueSuccessAcknowledgement {
  /**
   * Negatively acknowledges the processing of a message from a queue.
   * @param requeue - If `true`, requeues the message.
   * @param allUpTo - If `true`, negatively acknowledges all messages up to and including the current message.
   */
  (requeue?: boolean, allUpTo?: boolean): void
}

/**
 * A function that listens for messages from a queue and processes them.
 * @interface
 */
export interface QueueMessageListener {
  /**
   * Processes a message from a queue.
   * @param message - The message to be processed.
   * @param ack - A function that acknowledges the successful processing of the message.
   * @param nack - A function that negatively acknowledges the processing of the message.
   */
  (
    message: QueueMessage,
    ack: QueueSuccessAcknowledgement,
    nack: QueueFailureAcknowledgement
  ): Promise<void> | void
}

/**
 * Options for listening to messages from a queue.
 * @interface
 */
export interface QueueListeningOptions {
  /**
   * Whether to block the event loop while waiting for messages.
   */
  blocking: boolean
  /**
   * Whether to positivly acknowledge messages that were not acknowledged by the listener.
   */
  ackOnNoAck: boolean
  /**
   * Whether to negatively acknowledge messages that were not acknowledged by the listener.
   */
  nackOnNoAck: boolean
  /**
   * Whether to requeue messages that caused an error during processing.
   */
  requeueOnError: boolean
  /**
   * When `nackOnNoAck` is `true`, whether to requeue messages that were not acknowledged by the listener.
   */
  requeueOnNoAck: boolean
  /**
   * Whether the message will be assumed by the server to be acknowledged immediately (i.e. dequeued) after delivery.
   */
  noAck: boolean
}

/**
 * An object representing a message fetched from a queue, along with the functions to acknowledge or negatively acknowledge its processing.
 * @interface
 */
export interface TickMessage {
  /**
   * The message fetched from the queue.
   */
  message: QueueMessage
  /**
   * A function that acknowledges the successful processing of the message.
   */
  ack: QueueSuccessAcknowledgement
  /**
   * A function that negatively acknowledges the processing of the message.
   */
  nack: QueueFailureAcknowledgement
}

/**
 * An object containing instrumentors for various queue operations.
 * @interface
 */
export interface QueueInstrumentors {
  /**
   * An instrumentor for pre-shutdown operations.
   */
  preShutDown: Instrumentor
  /**
   * An instrumentor for shutdown operations.
   */
  shutdown: Instrumentor
  /**
   * An instrumentor for check operations.
   */
  check: Instrumentor
  /**
   * An instrumentor for delete operations.
   */
  delete: Instrumentor
  /**
   * An instrumentor for purge operations.
   */
  purge: Instrumentor
  /**
   * An instrumentor for enqueue operations.
   */
  enqueue: Instrumentor
  /**
   * An instrumentor for acknowledge operations.
   */
  ack: Instrumentor
  /**
   * An instrumentor for negative acknowledge operations.
   */
  nack: Instrumentor
  /**
   * An instrumentor for get operations.
   */
  get: Instrumentor
  /**
   * An instrumentor for listen operations.
   */
  listen: Instrumentor
  /**
   * An instrumentor for pause operations.
   */
  pause: Instrumentor
  /**
   * An instrumentor for event listener operations.
   */
  eventListener: Instrumentor
  /**
   * An instrumentor for event emitter operations.
   */
  eventEmitter: Instrumentor
  /**
   * An instrumentor for message listener operations.
   */
  messageListener: Instrumentor
  /**
   * An instrumentor for tick operations.
   */
  tick: Instrumentor
  /**
   * An instrumentor for consumer operations.
   */
  consumer: Instrumentor
}

/**
 * An object representing the dead-letter information of a message.
 * @interface
 */
export interface XDeath {
  /**
   * The number of times the message has been rejected or expired.
   */
  'count': number
  /**
   * The reason for the message being dead-lettered.
   */
  'reason': 'rejected' | 'expired' | 'maxlen'
  /**
   * The name of the queue where the message was dead-lettered.
   */
  'queue': string
  /**
   * The timestamp of when the message was dead-lettered.
   */
  'time': {
    /**
     * The type of the timestamp.
     */
    '!': 'timestamp'
    /**
     * The value of the timestamp.
     */
    'value': number
  }
  /**
   * The name of the exchange where the message was dead-lettered.
   */
  'exchange': string
  /**
   * The original expiration time of the message.
   */
  'original-expiration'?: any
  /**
   * The routing keys of the message.
   */
  'routing-keys': string[]
}

/**
 * Type for error event listener.
 * @callback QueueErrorEventListener
 * @param {Error} err - The error object.
 * @returns {Promise<void> | void}
 */
export type QueueErrorEventListener = (err: Error) => Promise<void> | void

/**
 * Type for deleted event listener.
 * @callback QueueDeletedEventListener
 * @returns {Promise<void> | void}
 */
export type QueueDeletedEventListener = () => Promise<void> | void

/**
 * Type for generic event listener.
 * @callback QueueGenericEventListener
 * @param {...any[]} args - The arguments.
 * @returns {Promise<void>}
 */
export type QueueGenericEventListener = (...args: any[]) => Promise<void>
