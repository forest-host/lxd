
import { EventEmitter } from 'events';
import { map_series, wait_for_socket_open } from './util';

// Cache events that occurred in LXD.
// We do this because events could occur before we are listening when running async operations
class EventStash extends EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.events = [];

        this.once('newListener', (_, listener) => {
            this.events.forEach(data => listener(data));
        })
    }

    // Listen for operation events on global LXD events sckoet
    async open_socket() {
        this.socket = await wait_for_socket_open(this.client.open_socket('/events?type=operation'));

        this.socket.on('message', string => {
            let message = JSON.parse(string);

            if(this.listenerCount('message') > 0) {
                // If there's listeners, pass it on
                this.emit('message', message);
            } else {
                // If there's no listeners, save event so we can pass it when something starts listening
                this.events.push(message);
            }
        });
    }

    // Close event socket
    close_socket() {
        this.socket.close();
    }
}

// TODO - We should be able to determine async or sync from response of LXD API, why don't we do this?
export class Operation {
    constructor(client) {
        this.client = client;
    }

    // Request & return operation metadata
    async request() {
        let response = await this.client.request(...arguments);

        return response.metadata;
    }

    // Simple HTTP method functions
    get(url, qs) { return this.request('GET', url, undefined, qs); }
    put(url, body, qs) { return this.request('PUT', ...arguments); }
    post(url, body, qs) { return this.request('POST', ...arguments); }
    delete(url, qs) { return this.request('DELETE', url, undefined, qs); }
}

// TODO - We should be able to determine async or sync from response of LXD API, why don't we do this?
export class AsyncOperation extends Operation {
    constructor(client, url) {
        super(client, url);
        this.interactive = false;
        this.timeout = 0;
    }

    // Make this operation an interactive operation (used to return websockets directly)
    make_interactive() {
        this.interactive = true;
    }

    // Timeout this async operation (used to cancel exec operations)
    timeout_after(millis) {
        this.timeout = millis;
    }

    // Override operation request method to wait for operation updates over global events socket
    async request() {
        // Cache events as we get events before we get the metadata back from request function 
        let stash = new EventStash(this.client);
        // Wait for socket to open before executing operation
        // This way we are sure we catch the events for this operation
        await stash.open_socket();

        try {
            let metadata = await super.request(...arguments);
            console.log(metadata)
            let output = await this.process_operation(metadata, stash);

            return output;
        } catch(err) {
            throw err;
        } finally {
            // Always close socket
            stash.close_socket();
        }
    }

    // Async operations can have multiple classes that require different handling
    async process_operation(metadata, stash) {
        switch (metadata.class) {
            case 'task':
                return this.process_task_operation(metadata, stash);
            case 'websocket':
                return this.process_websocket_operation(metadata);
            case 'token':
                return Promise.resolve(metadata);
            default: 
                return Promise.reject(new Error('API returned unknown operation class'));
        }
    }

    // Task operations are simple async operations
    process_task_operation(metadata, stash) {
        return new Promise((resolve, reject) => {
            stash.on('message', message => {
                // Don't handle events for other operations
                if(message.metadata.id != metadata.id) {
                    return;
                }
                if(message.metadata.status_code == 200) {
                    return resolve(message.metadata);
                }
                if(message.metadata.status_code == 400 || message.metadata.status_code == 401) {
                    return reject(new Error(message.metadata.err));
                }
            });
        });
    }

    // Websocket operations are used for container command exec logic, they can return data over sockets
    // Open up sockets & finalize
    async process_websocket_operation(metadata) {
        // Setup control socket first by reversing fds, do this because process will start after all fds except control are connected
        // If we connect control last, it's possible to miss the close event
        let file_descriptors = Object.keys(metadata.metadata.fds).reverse();

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

    // Finalize websocket operation, collecting data from sockets or returning them directly based on "interactive" bool
    async finalize_websocket_operation(sockets, metadata) {
        var result = {
            stdout: [],
            stderr: [],
        };

        for (let i = 0; i < Object.keys(result).length; i++) {
            let key = Object.keys(result)[i];

            // Create arrays of lines of output
            sockets[(i + 1).toString()].on('message', data => {
                let string = data.toString('utf8').trim();

                // Push strings onto output array, seperated by newline, use apply so we can pass split string as arguments to push
                if(string) {
                    result[key] = [ ...result[key], ...string.split('\n')];
                }
            });
        }


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


            // Control socket closes when done executing, we will have to close the other sockets manually after control closes
            sockets.control.on('close', () => {
                // Clear timeout as we can not send control signals through closed socket
                if(this.timeout > 0) {
                    clearTimeout(timeout);
                }

                // When control closes, we can safely close the stdin/stdout socket
                ['0', '1', '2'].forEach(key => sockets[key].close());
                resolve(result);
            });
        });

        // After getting output from sockets we need to get the statuscode from the operation
        output.status = await this.get_exit_code(metadata);

        return output;
    }

    // Get exit code of exec command operation
    async get_exit_code(metadata, retries = 0, timeout = 500) {
        // After getting output from sockets we need to get the statuscode from the operation
        let response = await super.request('GET', `/operations/${metadata.id}`);

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

