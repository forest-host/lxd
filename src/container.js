
import extend from 'extend';
import { Readable as readable } from 'stream';

export default class Container {
  constructor(client, name) {
    this.client = client;
    this.name = name;
  }

  url() {
    return `/instances/${this.name}`;
  }

  async load() {
    let response = await this.client.run_operation({ url: this.url() });
    this.config = response;

    return this;
  }

  on_target(host) {
    this.target = host;
    return this;
  }

  from_image(os, release) {
    this.image = { os, release, architecture: 'amd64' };
    return this;
  }

  async create() {
    let config = {
      method: 'POST',
      url: '/instances',
      body: {
        name: this.name,
        architecture: 'x86_64',
        // Defaults
        profiles: typeof this.profiles !== undefined ? this.profiles : ['default'],
        ephemeral: typeof this.ephemeral !== undefined ? this.ephemeral : false,
      },
    };

    if(typeof this.image !== undefined) {
      config.body.source = { type: 'image', properties: this.image };
    }

    if(typeof this.target !== undefined) {
      config.qs = { target: this.target };
    }

    // Create container
    await this.client.run_async_operation(config)
    return this.load();
  }

  // (stop, start, restart, freeze or unfreeze)
  async state(action, force = false, timeout = 60, stateful = false) {
    // create container request
    let response = await this.client.run_async_operation({
      method: 'PUT',
      url: `${this.url()}/state`,
      body: { action, timeout, force, stateful },
    });

    if(response.err) {
      return Promise.reject(response.err);
    } else {
      return this;
    }
  }

  get_state() {
    return this.client.run_operation({ url: `${this.url()}/state` });
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
    await this.client.run_async_operation({ method: 'DELETE', url: this.url() });
    delete this.config;

    return this;
  }

  async patch(body) {
    let response = await this.client.run_operation({ method: 'PATCH', url: this.url(), body, });
    return this.load();
  }

  async put(body) {
    let response = await this.client.run_async_operation({ method: 'PUT', url: this.url(), body, })
    return this.load();
  }

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
    return this.client.run_async_operation({ 
      method: 'POST', 
      url: `${this.url()}/exec`,
      body: {
        command: ['/bin/sh', '-c', cmd],
        environment: options.environment || {},
        'wait-for-websocket': true,
        interactive: true,
      },
      timeout: options.timeout,
      interactive: options.interactive,
    });
  }

  upload_string(string, path) {
    // TODO - Body used to be returned without content-type:json, check if this is still the case
    return this.client.raw_request({
      method: 'POST', 
      url: `${this.url()}/files`,
      qs: { path: path },
      json: false,
      headers: {
        'X-LXD-type': 'file',
        'Content-Type': 'plain/text',
      },
      body: string,
    });
  }

  upload(stream, path) {
    let request = this.client.raw_request({
      method: 'POST', 
      url: `${this.url()}/files`,
      qs: { path: path },
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
    return this.client.raw_request({ url: `${this.url()}/files`, qs: { path: path } })
  }
}

