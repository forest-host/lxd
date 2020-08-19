
import { map_series, wait_for_socket_open } from './util';

export class Operation {
  constructor(client) {
    this.client = client;
  }

  async request(method, url, body) {
    let response = await this.client.request(...arguments);
    return response.metadata;
  }

  get(url) { return this.request('GET', ...arguments); }
  put(url, body) { return this.request('PUT', ...arguments); }
  patch(url, body) { return this.request('PATCH', ...arguments); }
  post(url, body) { return this.request('POST', ...arguments); }
  delete(url) { return this.request('DELETE', ...arguments); }
}

export class AsyncOperation extends Operation {
  constructor(client, url) {
    super(client, url);
    this.interactive = false;
    this.timeout = 0;
  }

  interactive() {
    this.interactive = true;
  }

  timeout_after(millis) {
    this.timeout = millis;
  }

  async request(method, url, body) {
    // Wait for socket to open before executing operation
    let socket = await wait_for_socket_open(this.client.open_socket('/events?type=operation'));

    try {
      let metadata = await super.request(...arguments);
      let output = await this.process_operation(metadata, socket);

      // Close events socket after succesful operation
      socket.close();
      return output;
    } catch(err) {
      // Just in case something fails, close socket
      socket.close();
      throw err;
    }
  }

  async process_operation(metadata, socket) {
    switch (metadata.class) {
      case 'task':
        return this.process_task_operation(metadata, socket);
      case 'websocket':
        return this.process_websocket_operation(metadata);
      case 'token':
        return Promise.resolve(metadata);
      default: 
        return Promise.reject(new Error('API returned unknown operation class'));
    }
  }

  process_task_operation(metadata, socket) {
    return new Promise((resolve, reject) => {
      socket.on('message', message => {
        var data = JSON.parse(message).metadata;

        // Don't handle events for other operations
        if(data.id != metadata.id) {
          return;
        }
        if(data.status_code == 200) {
          return resolve(data);
        }
        if(data.status_code == 400 || data.status_code == 401) {
          return reject(new Error(data.err));
        }
      });
    });
  }

  async process_websocket_operation(metadata) {
    // Setup control socket first by reversing fds, do this because process will start after all fds except control are connected
    // If we connect control last, it's possible to miss the close event
    let file_descriptors;
    try {
      file_descriptors = Object.keys(metadata.metadata.fds).reverse();
    } catch(err) {
      console.log(metadata);
      //console.log(file_descriptors);
      throw err;
    }

    // TODO - Why do we mapseries? (probably to first open control socket before others but i'm not sure)
    // "map" the keys of this object to new object of sockets
    let sockets = await map_series(file_descriptors, async key => {
      // Generate url from metadata
      var url = `/operations/${metadata.id}/websocket?secret=${metadata.metadata.fds[key]}`;
      let socket = await wait_for_socket_open(this.client.open_socket(url));

      return { [key]: socket };
    });

    // Create one object from all the small ones
    sockets = Object.assign(...sockets);

    // It is possible to pass interactive to config
    if(this.interactive) {
      return Promise.resolve(sockets);
    } else {
      return this.finalize_websocket_operation(sockets, metadata);
    }
  }

  async finalize_websocket_operation(sockets, metadata) {
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
      if(this.timeout > 0) {
        var timeout = setTimeout(() => {
          sockets.control.send(JSON.stringify({
            command: "signal",
            signal: 15
          }));
        }, this.timeout);
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
        if(this.timeout > 0) {
          clearTimeout(timeout);
        }

        // When control closes, we can safely close the stdin/stdout socket
        sockets[0].close();
      });
    });

    // After getting output from sockets we need to get the statuscode from the operation
    output.status = await this.get_exit_code(metadata);

    return output;
  }

  async get_exit_code(metadata, retries = 0, timeout = 500) {
    // After getting output from sockets we need to get the statuscode from the operation
    let response = await super.get('/operations/' + metadata.id);

    // This logic is triggered on closing of operation control socket. It could happen though that socket closes,
    // but the operation in lxd is still marked as running.. In that case debounce
    if(typeof(response.metadata.return) == "undefined") {
      if(retries < 5) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, timeout));
        return this.get_exit_code(metadata, retries + 1, timeout);
      } else {
        // We retried all the times we could. this command failed
        return 1;
      }
    } else {
      return response.metadata.return;
    }
  }
}

