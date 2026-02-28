export function withTimeout(promiseFactory, ms, label = 'Operation timed out') {
  let timer

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms)
  })

  return Promise.race([
    Promise.resolve().then(promiseFactory),
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timer)
  })
}

export function sleep(ms, signal) {
  if (signal?.aborted) {
    throw new Error('Cancelled')
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Cancelled'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error('Cancelled')
  }
}
