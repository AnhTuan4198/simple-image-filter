// Define a task registry map:
const taskRegistry = new Map()

const TYPES = {
  REGISTER_TASK: 'registerTask',
  EXECUTE_TASK: 'executeTask',
  RECEIVE_RESULT: 'receiveResult',
}

const runningTask = new Map()

const isRegistered = (taskName) => {
  return taskRegistry.has(taskName)
}

/**
 *
 * Concatenates the remote dependencies into a comma separated string.
 * this string will then be passed as an argument to the "importScripts" function
 *
 * @param {Array.<String>}} deps array of string
 * @returns {String} a string composed by the concatenation of the array
 * elements "deps" and "importScripts".
 *
 * @example
 * remoteDepsParser(['http://js.com/1.js', 'http://js.com/2.js']) // importScripts('http://js.com/1.js', 'http://js.com/2.js')
 */
const remoteDepsParser = (deps = []) => {
  if (deps.length === 0) return ''

  const depsString = deps.map((dep) => `'${dep}'`).toString()
  return `importScripts(${depsString})`
}

/**
 * This function accepts as a parameter a function "userFunc"
 * And as a result returns an anonymous function.
 * This anonymous function, accepts as arguments,
 * the parameters to pass to the function "useArgs" and returns a Promise
 * This function can be used as a wrapper, only inside a Worker
 * because it depends by "postMessage".
 *
 * @param {Function} userFunc {Function} fn the function to run with web worker
 *
 * @returns {Function} returns a function that accepts the parameters
 * to be passed to the "userFunc" function
 */
const jobRunner = (options) => (e) => {
  const { taskName, userFuncArgs } = e.data
  console.log('job runner')

  const result = options.fn(...userFuncArgs)
  const isTransferable = (val) =>
    ('ArrayBuffer' in self && val instanceof ArrayBuffer) ||
    ('MessagePort' in self && val instanceof MessagePort) ||
    ('ImageBitmap' in self && val instanceof ImageBitmap) ||
    ('OffscreenCanvas' in self && val instanceof OffscreenCanvas)
  const transferList =
    options.transferable === 'auto' && isTransferable(result) ? [result] : []
  // @ts-ignore
  postMessage(
    {
      type: 'receiveResult',
      taskName,
      result,
    },
    transferList,
  )
}

/**
 * Converts the "fn" function into the syntax needed to be executed within a web worker
 *
 * @param {Function} fn the function to run with web worker
 * @param {Array.<String>} deps array of strings, imported into the worker through "importScripts"
 *
 * @returns {String} a blob url, containing the code of "fn" as a string
 *
 * @example
 * createWorkerBlobUrl((a,b) => a+b, [])
 * // return "onmessage=return Promise.resolve((a,b) => a + b)
 * .then(postMessage(['SUCCESS', result]))
 * .catch(postMessage(['ERROR', error])"
 */
const createWorkerBlobUrl = (
  fn,
  deps,
  transferable /* localDeps: () => unknown[], */,
) => {
  const blobCode = `
    self.onmessage=(${jobRunner})({
      fn: (${fn}),
      transferable: '${transferable}'
    })
  `
  const blob = new Blob([blobCode], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  return url
}

self.onmessage = (event) => {
  const { type, taskName } = event.data;
  console.log(event);
  switch (type) {
    case TYPES.REGISTER_TASK: {
      if (isRegistered(taskName)) break
      const { fn } = event.data
      taskRegistry.set(taskName, fn)
      break
    }
    case TYPES.EXECUTE_TASK: {
      if (!isRegistered(taskName)) {
        throw Error('Task is not registered')
      } else {
        const { args } = event.data
        // Execute here
        const taskHandlerAsStr = taskRegistry.get(taskName)
        const taskHandler = new Function('return' + taskHandlerAsStr)()
        const subWorkerURL = createWorkerBlobUrl(taskHandler)
        const subWorker = new Worker(subWorkerURL)

        subWorker.postMessage({
          taskName,
          userFuncArgs: args,
        })
        subWorker.addEventListener('message',(event) => {
          const { result, taskName } = event.data;
          URL.revokeObjectURL(subWorkerURL);
          // subWorker.terminate();
          self.postMessage({ taskName, result })
        })
      }
      break
    }
    default:
      break
  }
}
