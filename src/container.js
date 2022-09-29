
import WebSocket from 'ws';
import { Readable as readable } from 'stream';

import Volume from './volume.js';
import Model from './model.js';

export default class Container extends Model {
    constructor(client, name) {
        return super(client, {
            name,
            architecture: 'x86_64',
            profiles: ['default'],
            ephemeral: false,
            devices: {},
            config: {},
        });
    }

    get url() {
        return `instances/${this.name}`;
    }

    // Set up container on target cluster host
    // (Only thing that has to be passed in querystring, probably as it's only respected on setup of new container, and migrate works differently)
    on_target(host) {
        this.target = host;
        return this;
    }

    // Setup new container from source image with alias
    from_image(alias) {
        this.config.source = { type: 'image', alias, };
        return this;
    }

    // Set lxd profiles container should use
    set_profile() {
        this.config.profiles = Array.from(arguments);
        return this;
    }

    // Set this container to be ephemeral or not, (should it persist across host reboots?);
    set_ephemeral(is_ephemeral) {
        this.config.ephemeral = is_ephemeral;
        return this;
    }

    // Create this container on LXD backend
    async create({ wait = true } = {}) {
        let config = {
            method: 'POST',
            url: 'instances',
            json: this.config,
        }
    
        if(typeof this.target !== 'undefined') {
            config.target = this.target
        }

        // Create container
        let operation = await this.client.start_operation(config)
        if(wait) {
            await operation.wait()
        }

        return this
    }

    // (stop, start, restart, freeze or unfreeze)
    async set_state({ action, force = false, wait = true } = {}) {
        // create container request
        let config = {
            method: 'PUT',
            url: `${this.url}/state`,
            json: {
                action, 
                force, 
                timeout: -1, 
                stateful: false 
            }
        }

        let operation = await this.client.start_operation(config)
        if(wait) {
            await operation.wait()
        }
        return this
    }

    start(config) { return this.set_state({ action: 'start', ...config }); }
    stop(config) { return this.set_state({ action: 'stop', ...config }); }
    restart(config) { return this.set_state({ action: 'restart', ...config }); }

    async get() {
        let response = await this.client.request({ url: this.url }).json()
        return response.metadata
    }

    async get_state() {
        let response = await this.client.request({ url: `${this.url}/state` }).json()
        return response.metadata
    }

    async get_ipv4_addresses() {
        let state = await this.get_state();
        return state.network.eth0.addresses.filter(address => address.family == 'inet');
    }

    // Wait a bit for network address, DHCP servers can be sloooooooooow
    async wait_for_dhcp_lease(retries = 0) {
        // Keep trying for 30 (60 * 500ms) seconds
        if(retries >= 60) {
            throw new Error('Container could not get dhcp lease');
        }

        let addresses = await this.get_ipv4_addresses()
        if( ! addresses.length) {
            // Wait for 500 ms, then try again
            await new Promise((resolve) => setTimeout(resolve, 500));
            return this.wait_for_dhcp_lease(++retries);
        } else {
            return this;
        }
    }

    // Remove this container from LXD backend
    async destroy({ wait = true } = {}) {
        let config = {
            url: this.url,
            method: 'DELETE',
        }
        let operation = await this.client.start_operation(config)
        if (wait) {
            await operation.wait()
        }

        return this;
    }

    // Force destruction on container
    async force_destroy() {
        try { await this.stop({ force: true }); } catch(e) {
            console.log(e.message)
        }
        try { await this.destroy(); } catch(e) {
            console.log(e.message)
        }

        return this
    }

    // Set LXD container config directive
    set_config(key, value) {
        this.config.config[key] = value;
        return this
    }

    // Unset LXD container config directive
    unset_config(key) {
        delete this.config.config[key];
        return this
    }

    // Set environment variable in container
    // @important Call update() on this container to update LXD container
    // TODO - Validate uppercase key? It's only convention....
    set_environment_variable(key, value) {
        return this.set_config(`environment.${key}`, value);
    }
    unset_environment_variable(key) {
        return this.unset_config(`environment.${key}`);
    }

    // Mount LXD volume or host path in this container at container path
    // @important Call update() on this container to update LXD container
    mount(volume, path, device_name) {
        this.config.devices[device_name] = { 
            path, 
            type: 'disk',
            source: volume.name,
            pool: volume.pool.name,
        };
        return this
    }

    // Unmount device
    // @important Call update() on this container to update LXD container
    unmount(device_name) {
        if( ! this.config.devices.hasOwnProperty(device_name)) {
            throw new Error('Device not found');
        }

        delete this.config.devices[device_name];
        return this
    }

    // Update containers config in LXD with current local container config
    // Its possible to update local config with "mount" & "set_environment_variable" functions
    async update({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'PATCH',
            url: this.url,
            json: {
                devices: this.config.devices,
                config: this.config.config,
            },
        })

        if (wait) {
            await operation.wait()
        }

        return this
    }

    // Execute command in container
    async exec(config = { command = [] } = {}) {
        // Valid command?
        if ( ! Array.isArray(config.command) || config.command.length == 0 ) {
            throw new Error('No command in arguments')
        }

        // Run command with joined args on container
        let defaults = {
            'wait-for-websocket': true,
            interactive: false,
        };

        // Create exec operation
        let operation = await this.client.start_operation({
            method: 'POST',
            url: `${this.url}/exec`,
            json: {
                ...config,
                ...defaults,
            },
        })
    
        // Create stdin, stdout, stderr sockets
        let sockets = ['0', '1', '2'].reduce((sockets, fd) => {
            let url = `${operation.url}/websocket?secret=${operation.metadata.metadata.fds[fd]}`;
            let socket = this.client.open_socket(url)
            return { ...sockets, [fd]: socket }
        }, {})

        // Capture outputs of command
        let output = { 'stdout': '', 'stderr': '' };
        sockets['1'].on('message', data => output['stdout'] += data.toString('utf8'))
        sockets['2'].on('message', data => output['stderr'] += data.toString('utf8'))

        // Wait for status code (indicating command has finished)
        while(true) {
            await operation.request({ url: operation.url })

            if('return' in operation.metadata.metadata) {
                break
            }

            await new Promise(resolve => setTimeout(resolve, 500))
        }
    
        // Close sockets & wait for close
        for(let fd in sockets) {
            sockets[fd].close()
        }
        
        return {
            return: operation.metadata.metadata.return,
            ...output
        }
    }

    // Upload string to file in container
    upload_string(string, path) {
        // TODO - Body used to be returned without content-type:json, check if this is still the case
        return this.client.request({
            method: 'POST',
            url: `${this.url}/files`,
            searchParams: { path },
            headers: {
                'X-LXD-type': 'file',
                'Content-Type': 'plain/text',
            },
            body: string,
        });
    }

    // Upload readable stream to container
    /*
    async upload(stream, path) {
        let request = await this.client.request({
            method: 'POST',
            url: `${this.url}/files`,
            searchParams: { path },
            headers: {
                'X-LXD-type': 'file',
            },
            body: stream
        });
    }
    */

    download(path) {
        return this.client.request({ 
            method: 'GET', 
            url: `${this.url}/files`, 
            searchParams: { path } 
        }).text()
    }
}

