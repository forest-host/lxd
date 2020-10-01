
import extend from 'extend';
import { Readable as readable } from 'stream';
import Volume from './volume';

export default class Container {
  constructor(client, name) {
    this.client = client;
    this.name = name;
  }

  url() {
    return `/instances/${this.name}`;
  }

  async load() {
    let response = await this.client.operation().get(this.url());
    this.config = response;

    return this;
  }

  // Chainable creation methods
  on_target(host) {
    this.target = host;
    return this;
  }
  from_image(os, release) {
    this.image = { os, release, architecture: 'amd64' };
    return this;
  }

  async create() {
    let body = {
      name: this.name,
      architecture: 'x86_64',
      // Defaults
      profiles: typeof this.profiles !== undefined ? this.profiles : ['default'],
      ephemeral: typeof this.ephemeral !== undefined ? this.ephemeral : false,
    };

    if(typeof this.image !== undefined) {
      body.source = { type: 'image', properties: this.image };
    }

    let args = ['/instances', body];

    if(typeof this.target !== 'undefined') {
      args.push({ target: this.target });
    }

    // Create container
    await this.client.async_operation().post(...args)
    return this.load();
  }

  // (stop, start, restart, freeze or unfreeze)
  async set_state(action, force = false, timeout = 60, stateful = false) {
    // create container request
    let response = await this.client.async_operation()
      .put(`${this.url()}/state`, { action, timeout, force, stateful })

    if(response.err) {
      return Promise.reject(response.err);
    } else {
      return this;
    }
  }

  start() { return this.set_state('start', ...arguments); }
  stop() { return this.set_state('stop', ...arguments); }
  restart() { return this.set_state('restart', ...arguments); }
  freeze() { return this.set_state('freeze', ...arguments); }
  unfreeze() { return this.set_state('unfreeze', ...arguments); }

  get_state() {
    return this.client.operation().get(`${this.url()}/state`);
  }

  // TODO - Make this general IPV4 & IPV6 logic
  async get_ipv4_addresses() {
    let state = await this.get_state();

    return state.network.eth0.addresses.filter(address => {
      return address.family == 'inet';
    });
  }

  async wait_for_dhcp(retries = 0) {
    // Keep trying for 30 seconds
    if(retries >= 60) {
      throw new Error('Container could not get dhcp lease');
    }

    let addresses = await this.get_ipv4_addresses();

    if( ! addresses.length) {
      // Wait for 500 ms, then try again
      await new Promise((resolve) => setTimeout(resolve, 500));
      return this.wait_for_dhcp(++retries);
    } else {
      return this;
    }
  }

  async destroy() {
    await this.client.async_operation().delete(this.url());
    delete this.config;

    return this;
  }

  // Low level update for container config
  async patch(body) {
    let response = await this.client.operation().patch(this.url(), body);
    return this.load();
  }
  async put(body) {
    let response = await this.client.async_operation().put(this.url(), body);
    return this.load();
  }

  // Make sure we loaded config from LXD backend, or error
  should_be_loaded() {
    if( ! this.hasOwnProperty('config')) {
      throw new Error('Load container config before updating container');
    }
    return this;
  }

  // Set environment variable in container
  // @important Call update() on this container to update LXD container
  // TODO - Validate uppercase key?
  set_environment_variable(key, value) {
    this.should_be_loaded();

    if( ! this.config.hasOwnProperty('config')) {
      this.config.config = {};
    }

    this.config.config[`environment.${key}`] = value;

    return this;
  }

  // Delete all environment vars from container
  // @important Call update() on this container to update LXD container
  unset_environment_variables() {
    this.should_be_loaded();

    // Delete all keys starting with environment
    Object.keys(this.config.config)
      .filter(key => key.substr(12) == 'environment.')
      .forEach(key => {
        delete this.config.config[key];
      });

    return this;
  }

  // Mount LXD volume or host path in this container at container path
  // @important Call update() on this container to update LXD container
  // TODO - Check if container_path is unique?
  mount(volume_or_host_path, container_path, device_name) {
    this.should_be_loaded();

    if( ! this.config.hasOwnProperty('devices')) {
      this.config.devices = {};
    }

    this.config.devices[device_name] = {
      path: container_path,
      type: 'disk',
    };

    if(volume_or_host_path instanceof Volume) {
      this.config.devices[device_name].source = volume_or_host_path.name;
      this.config.devices[device_name].pool = volume_or_host_path.pool.name;
    } else if(typeof(volume_or_host_path) === 'string') {
      this.config.devices[device_name].source = volume_or_host_path;
    } else {
      throw new Error('Only volumes or host paths can be mounted')
    }

    // Chainable
    return this;
  }

  // Unmount device
  // @important Call update() on this container to update LXD container
  unmount(device_name) {
    this.should_be_loaded();

    if( ! this.config.devices.hasOwnProperty(device_name)) {
      throw new Error('Device not found');
    }

    delete this.config.devices[device_name];

    return this;
  }

  // Update containers config in LXD with current local container config
  // Its possible to update local config with "mount" & "set_environment_variable" functions
  update() {
    this.should_be_loaded();
    return this.put(this.config);
  }

  // Execute command in container
  exec(cmd, args, options) {
    // It is possible to not pass option so check last argument to see if it is a options object
    var last = arguments[arguments.length - 1];
    options = last === Object(last) ? last : {};

    // It is possible to not pass arguments, so check if second argument to function is an array of arguments
    args = Array.isArray(arguments[1]) ? arguments[1] : [];

    // Change dir before command execution if cwd is set
    cmd = 'cwd' in options && options.cwd != '' ? `cd ${options.cwd}; ${cmd}` : cmd;
    // Add args to cmd
    cmd += args.length ? ' ' + args.join(' ') : '';

    // Run command with joined args on container
    let body = {
      command: ['/bin/sh', '-c', cmd],
      environment: options.environment || {},
      'wait-for-websocket': true,
      interactive: true,
    };

    let operation = this.client.async_operation();

    if(typeof(options.interactive) === 'boolean' && options.interactive) {
      operation.make_interactive();
    }
    if(typeof(options.timeout) === 'number') {
      operation.timeout_after(options.timeout);
    }

    return operation.post(`${this.url()}/exec`, body);
  }

  // Upload string to file in container
  upload_string(string, path) {
    // TODO - Body used to be returned without content-type:json, check if this is still the case
    return this.client.raw_request({
      method: 'POST',
      url: `${this.url()}/files`,
      qs: { path },
      json: false,
      headers: {
        'X-LXD-type': 'file',
        'Content-Type': 'plain/text',
      },
      body: string,
    });
  }

  // Upload readable stream to container
  upload(stream, path) {
    let request = this.client.raw_request({
      method: 'POST',
      url: `${this.url()}/files`,
      qs: { path },
      json: false,
      headers: {
        'X-LXD-type': 'file',
      }
    });

    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', () => {
        stream.destroy();
        resolve();
      });

      stream.pipe(request);
    })
  }

  download(path) {
    return this.client.raw_request({ method: 'GET', url: `${this.url()}/files`, qs: { path: path } })
  }
}

