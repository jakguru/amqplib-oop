import amqplib from 'amqplib'
import Emittery from 'eventemitter2'

/**
 * Importing necessary types and classes for Queue.
 * @typedef {import('../types/Queue').ConnectionChannel} ConnectionChannel
 * @typedef {import('../types/Queue').GetMessagesOptions} GetMessagesOptions
 * @typedef {import('../types/Queue').QueueAssertionOptions} QueueAssertionOptions
 * @typedef {import('../types/Queue').QueueEnqueueOptions} QueueEnqueueOptions
 * @typedef {import('../types/Queue').QueueListeningOptions} QueueListeningOptions
 * @typedef {import('../types/Queue').QueueMessage} QueueMessage
 * @typedef {import('../types/Queue').QueueMessageListener} QueueMessageListener
 * @typedef {import('../types/Queue').TickMessage} TickMessage
 * @typedef {import('../types/Queue').QueueInstrumentors} QueueInstrumentors
 * @typedef {import('./Connection').Connection} Connection
 */
import type {
  ConnectionChannel,
  GetMessagesOptions,
  QueueEnqueueOptions,
  QueueInstrumentors,
  QueueListeningOptions,
  QueueMessage,
  QueueMessageListener,
  TickMessage,
} from '../types/Queue'
import type { Connection } from './Connection'

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
   * @param {(err: Error) => Promise<void> | void} listener - The function to invoke when the 'error' event is emitted.
   * @returns {void}
   */
  public $on(event: 'error', listener: (err: Error) => Promise<void> | void): void
  /**
   * Registers an event listener for the 'deleted' event.
   * @param {string} event - The name of the event to listen for ('deleted').
   * @param {() => Promise<void> | void} listener - The function to invoke when the 'deleted' event is emitted.
   * @returns {void}
   */
  public $on(event: 'deleted', listener: () => Promise<void> | void): void
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
   * @param {(...args: any[]) => Promise<void>} listener - The function to invoke when the event is emitted.
   * @returns {void}
   */
  public $on(event: string, listener: (...args: any[]) => Promise<void>): void {
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
   * @param {(err: Error) => Promise<void> | void} listener - The function to remove as a listener for the 'error' event.
   * @returns {void}
   */
  public $off(event: 'error', listener: (err: Error) => Promise<void> | void): void
  /**
   * Removes the specified event listener for the 'deleted' event.
   * @param {string} event - The name of the event to remove the listener from ('deleted').
   * @param {() => Promise<void> | void} listener - The function to remove as a listener for the 'deleted' event.
   * @returns {void}
   */
  public $off(event: 'deleted', listener: () => Promise<void> | void): void
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
   * @param {(...args: any[]) => Promise<void>} listener - The function to remove as a listener for the event.
   * @returns {void}
   */
  public $off(event: string, listener: (...args: any[]) => Promise<void>): void {
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
   * @param {(err: Error) => Promise<void> | void} listener - The function to invoke when the 'error' event is emitted.
   * @returns {void}
   */
  public $once(event: 'error', listener: (err: Error) => Promise<void> | void): void
  /**
   * Registers a one-time event listener for the 'deleted' event.
   * The listener will be invoked at most once for the event, and then removed.
   * @param {string} event - The name of the event to listen for ('deleted').
   * @param {() => Promise<void> | void} listener - The function to invoke when the 'deleted' event is emitted.
   * @returns {void}
   */
  public $once(event: 'deleted', listener: () => Promise<void> | void): void
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
   * @param {(...args: any[]) => Promise<void>} listener - The function to invoke when the event is emitted.
   * @returns {void}
   */
  public $once(event: string, listener: (...args: any[]) => Promise<void>): void {
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
