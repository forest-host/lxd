
import path from 'path';
import stream from 'stream';
import fs from 'fs';
import request from 'request-promise-native';
import WebSocket from 'ws';
import extend from '@forest.host/extend';

import { AsyncOperation, Operation } from './operation';
import Container from './container';
import Pool from './pool';
import { map_series, wait_for_socket_open } from './util';

export default class Client {
  constructor(config) {
    // Add defaults
    this.config = extend({ api_version: '1.0', }, config);
    this.config.base_url = `${this.config.host}:${this.config.port}/${this.config.api_version}`;

    // Load certs if string was passed
    if(typeof(this.config.cert) == 'string') {
      this.config.cert = fs.readFileSync(this.config.cert);
    }
    if(typeof(this.config.key) == 'string') {
      this.config.key = fs.readFileSync(this.config.key);
    }

    this.agentOptions = {
      cert: this.config.cert,
      key: this.config.key,
      port: this.config.port,
      rejectUnauthorized: false,
    };
  }

  // TODO - Remove this, add functions to container to add vars, to add mounts & to add volumes
  get_container_config(variables, mounts = [], volumes = []) {
    return {
      config: get_variables_as_config(variables),
      devices: Object.assign(get_mounts_as_devices(mounts || []), get_volumes_as_devices(volumes || [])),
    };
  }

  open_socket(url) {
    // Get events listener 
    return new WebSocket(`wss://${this.config.base_url}${url}`, this.agentOptions);
  }

  request(method, url, body) {
    // Set url
    let data = { 
      agentOptions: this.agentOptions,
      json: true,
      method,
      url: `https://${this.config.base_url}${url}`,
    };
    
    if(typeof(body) === 'object') {
      data.body = body;
    }

    // Actually make the request
    return request(data);
  }

  operation(url) {
    return new Operation(this);
  }

  async_operation(url) {
    return new AsyncOperation(this);
  }
  
  /*
  async run_operation(config) {
    // Raw request
    let body = await this.request(config);
    // Handle response
    if(body.type == 'error') {
      throw new Error(body.error);
    }

    return body.metadata;
  }

  process_task_operation(operation, socket) {
    return new Promise((resolve, reject) => {
      socket.on('message', message => {
        var data = JSON.parse(message).metadata;

        // Don't handle events for other operations
        if(data.id != operation.id) {
          return;
        }

        // Success
        if(data.status_code == 200) {
          return resolve(data);
        }

        // Failure
        if(data.status_code == 400 || data.status_code == 401) {
          return reject(new Error(data.err));
        }
      });
    });
  }

  // TODO - Move this to operation class
  async process_operation(operation, config, socket) {
    switch (operation.class) {
      case 'task':
        return this.process_task_operation(operation, socket);
      case 'websocket':
        return this.process_websocket_operation(operation, config);
      case 'token':
        return Promise.resolve(operation);
      default: 
        return Promise.reject(new Error('API returned unknown operation class'));
    }
  }

  // TODO - Move this to operation class
  async run_async_operation(config) {
    // Wait for socket to open before executing operation
    let socket = await wait_for_socket_open(this.get_events_socket());

    // Request an operation
    try {
      let operation = await this.run_operation(config)
      let output = await this.process_operation(operation, config, socket);

      // Close events socket after succesful operation
      socket.close();
      return output;
    } catch(err) {
      // Just in case something fails, close socket
      socket.close();
      throw err;
    }
  }

  // TODO - Move this to operation class
  async get_exit_code(operation, retries = 0, timeout = 500) {
    // After getting output from sockets we need to get the statuscode from the operation
    let response = await this.run_operation({ url: '/operations/' + operation.id })

    // This logic is triggered on closing of operation control socket. It could happen though that socket closes,
    // but the operation in lxd is still marked as running.. In that case debounce
    if(typeof(response.metadata.return) == "undefined") {
      if(retries < 5) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, timeout));
        return this.get_exit_code(operation, retries + 1, timeout);
      } else {
        // We retried all the times we could. this command failed
        return 1;
      }
    } else {
      return response.metadata.return;
    }
  }

  // TODO - Move this to operation class
  async finalize_websocket_operation(sockets, operation) {
    var result = {
      output: [],
    };

    // Create arrays of lines of output
    sockets['0'].on('message', data => {
      let string = data.toString('utf8').trim();

      // Push strings onto output array, seperated by newline, use apply so we can pass split string as arguments to push
      if(string) {
        result.output = [ ...result.output, ...string.split('\n')];
      }
    });

    let output = await new Promise((resolve, reject) => {
      // We do not want to run commands longer than 10 minutes, send kill signal after that
      if(config.timeout) {
        var timeout = setTimeout(() => {
          sockets.control.send(JSON.stringify({
            command: "signal",
            signal: 15
          }));
        }, config.timeout);
      }

      Object.keys(sockets).forEach(socket => {
        sockets[socket].on('error', () => {
          reject(new Error('Socket returned error'));
        });
      });

      // TODO - Now we return on closed state of stdin/stdout socket. Before, we sometimes queried the operation before it was finished
      // resulting in no status_code. See if this will solve that
      sockets[0].on('close', () => {
        resolve(result);
      });

      // Control socket closes when done executing
      sockets.control.on('close', () => {
        // Clear timeout as we can not send control signals through closed socket
        if(config.timeout) {
          clearTimeout(timeout);
        }

        // When control closes, we can safely close the stdin/stdout socket
        sockets[0].close();
      });
    });

    // After getting output from sockets we need to get the statuscode from the operation
    output.status = await this.get_exit_code(operation);

    return output;
  }

  async process_websocket_operation(operation, config) {
    // Setup control socket first by reversing fds, do this because process will start after all fds except control are connected
    // If we connect control last, it's possible to miss the close event
    let file_descriptors = Object.keys(operation.metadata.fds).reverse();

    // "map" the keys of this object to new object of sockets
    let sockets = await map_series(file_descriptors, key => {
      // Generate url from metadata
      var url = `wss://${this.config.base_url}/operations/${operation.id}/websocket?secret=${operation.metadata.fds[key]}`;

      // Create socket listening to url
      let socket = new WebSocket(url, {
        cert: this.config.cert,
        key: this.config.key,
        port: this.config.port,
        rejectUnauthorized: false,
        //ecdhCurve: 'secp384r1',
      });

      // Wait for open & return
      return wait_for_socket_open(socket)
        .then(() => ({ [key]: socket }));
    });

    // Create one object from all the small ones
    sockets = Object.assign(...sockets);

    // It is possible to pass interactive to config
    if(config.interactive) {
      return Promise.resolve(sockets);
    } else {
      return this.finalize_websocket_operation(sockets, operation, config);
    }
  }
  */

  get_pool(name) {
    return new Pool(this, name);
  }

  get_container(name) {
    return new Container(this, name);
  }

  async list() {
    let list = await this.operation().get('/containers');
    return list.map(url => path.basename(url));
  }
}
