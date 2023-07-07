/**
 * Represents an instrumentor function that takes a function handle as input and returns its return type.
 *
 * @remarks
 * Instrumentors are functions which sit between the caller and the callee.
 * By default there is no instrumentation included with the project, but by using Instrumentors you can add your own.
 * This is very heavily influenced by New Relic's instrumentation, and allows you to gain much deeper insignts
 * into code which uses this library.
 *
 * @see [newrelic.startBackgroundTransaction](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/api-guides/nodejs-agent-api/#startBackgroundTransaction) for more information.
 */
export interface Instrumentor {
  /**
   * Takes a function handle as input and returns its return type.
   * @param handle - The function handle to be instrumented.
   * @returns The return type of the function handle.
   */
  (handle: Function): ReturnType<handle>
}
