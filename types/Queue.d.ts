import type amqplib from 'amqplib'
import type { Instrumentor } from './Instrumentation'
export { Channel, ConfirmChannel } from 'amqplib'
export { QueueAssertionOptions } from './Connection'

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
  (requeue?: boolean, allUpTo: boolean = false): void
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
