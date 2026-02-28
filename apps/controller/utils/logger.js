export function createLogger(scope) {
  const prefix = `[Lumit/${scope}]`

  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    debug: (...args) => {
      if (process.env.LUMIT_DEBUG === 'true') {
        console.debug(prefix, ...args)
      }
    }
  }
}
