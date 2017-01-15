module.exports = (root) => {
  return new Context(root)
}


const path = require('path')
const {fail} = require('./util')
const clone = require('clone')
const thenify = require('simple-thenify')
const { EventEmitter } = require('events')
const util = require('util')

const DEFAULT_CONTEXT = {
  error: require('./error'),
  log: require('./log'),
  service: require('./service'),
  model: require('./model')
}


function setup_config (root) {
  let config
  const config_path = path.join(root, 'config')

  try {
    config = require(config_path)
  } catch (e) {
    const error = new Error(`fails to read config: ${e.message}`)
    error.stack = e.stack
    return Promise.reject(error)
  }

  return clone(config)
}


class EE extends EventEmitter {
  constructor () {
    super()
    this._defaults = {}
  }

  default (name, handler) {
    if (!util.isFunction(handler)) {
      throw new TypeError(`default handler must be a function.`)
    }

    this._defaults[name] = handler
    return this
  }

  emit (name, ...args) {
    if (this.listenerCount(name) > 0) {
      super.emit(name, ...args)
      return
    }

    const handler = this._defaults[name]
    if (handler) {
      handler(...args)
    }
  }
}


class Context {
  constructor (root) {
    this._root = root
    this._plugins = {}
    this._plugins.__proto__ = DEFAULT_CONTEXT
    this._config = setup_config(root)

    const _setup_context = {
      root,
      config: this._config
      emitter: new EE
    }

    this._setup_context = Object.freeze(_setup_context)
  }

  plugin (name, plugin) {
    if (arguments.length === 1) {
      plugin = name
      name = plugin.name
    }

    // Do not allow 3rd plugins to use property 'reserved'
    if ('reserved' in plugin) {
      fail(`property "reserved" of plugin is not allowed.`)
    }

    if (name === 'config') {
      fail(`plugin "${name}" is reserved.`)
    }

    if (this._plugins.hasOwnProperty(name)) {
      fail(`plugin "${name}" already exists.`)
    }

    const defaults = DEFAULT_CONTEXT[name]
    if (defaults && defaults.reserved) {
      fail(`plugin "${name}" is reserved.`)
    }

    this._plugins[name] = plugin

    return this
  }

  create () {
    const context = {
      config: this._config
    }
    const tasks = []

    for (let name in this._plugins) {
      const {
        setup
      } = this._plugins[key]

      // TODO: setup arguments
      const task = thenify(setup).call(this._setup_context)
      tasks.push(task)
    }

    return Promise.all(tasks)
    .then(() => {
      return Object.freeze(context)
    })
  }
}
