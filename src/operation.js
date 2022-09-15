
export class Operation {
    constructor(client) {
        this.client = client
    }

    get url() {
        return `operations/${this.metadata.id}`
    }

    // Start operation in LXD backend
    async start() {
        let response = await this.client.request(...arguments).json()

        if (response.error != '') {
            throw new Error(response.error)
        }

        this.type = response.type
        this.metadata = response.metadata
        return this
    }

    async wait() {
        // Certain operations are "sync", meaning we dont have to wait
        if(this.type == 'sync') {
            return this
        }

        const config = { 
            url: `${this.url}/wait` 
        }
        let response = await this.client.request(config).json()

        if(response.metadata.status == 'Failure') {
            throw new Error(response.metadata.err)
        }
        
        return this
    }
}

/*
// TODO - We should be able to determine async or sync from response of LXD API, why don't we do this?
export class AsyncOperation extends Operation {
    constructor(client, url) {
        super(client, url);
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
        let sockets = file_descriptors.reduce(fd => {
            let url = `/operations/${metadata.id}/websocket?secret=${metadata.metadata.fds[fd]}`;
            return { ...agg, [fd]: socket }
        }, {})

        // Wait for sockets to open
        await Promise.all(Object.keys(sockets)
            .map(fd => new Promise(resolve => sockets[fd].on('open', resolve))))

        let result = { stdout: '', stderr: '' };

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
            Object.keys(sockets).forEach(socket => {
                sockets[socket].on('error', () => {
                    reject(new Error('Socket returned error'));
                });
            });

            // Control socket closes when done executing, we will have to close the other sockets manually after control closes
            sockets.control.on('close', () => {
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
    // TODO - look at this retry/time-out logic, it feels error prone
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

*/
