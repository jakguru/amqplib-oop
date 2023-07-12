import { Connection } from './src/Connection'
import ChannelError from './src/Errors/ChannelError'
import ConnectionError from './src/Errors/ConnectionError'
import QueueError from './src/Errors/QueueError'
export type * from './src/Connection'
export type * from './src/Instrumentation'
export type * from './src/Queue'
/**
 * Exports the Connection class.
 */
export { ChannelError, Connection, ConnectionError, QueueError }

/**
 * Exports the Connection class as the default export.
 */
export default Connection
