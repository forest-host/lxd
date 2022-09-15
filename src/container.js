
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
    async create({ wait = false } = {}) {
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
    async set_state({ action, force = false, wait = false } = {}) {
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

    get_state() {
        return this.client.operation().get(`${this.url}/state`);
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
    async destroy({ wait = false } = {}) {
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
        try { await this.stop({ wait: true }); } catch(e) {
            console.log(e.message)
        }
        try { await this.destroy(); } catch(e) {
            console.log(e.message)
        }

        return this
    }

    // Low level update for container config
    async put(body) {
        let response = await this.client.async_operation().put(this.url, body);
        return this.load();
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
    update() {
        return this.put(this.config);
    }

    // Execute command in container
    exec(cmd, args, options) {
        // It is possible to not pass `args` so check last argument to see if it is a options object
        let last = arguments[arguments.length - 1];
        options = last === Object(last) ? last : {};

        // It is possible to not pass `args`, so check if second argument to function is an array of arguments
        args = Array.isArray(arguments[1]) ? arguments[1] : [];

        // Run command with joined args on container
        let body = {
            command: [cmd, ...args],
            'wait-for-websocket': true,
            interactive: false,
            ...options,
        };

        // Create exec operation
        return this.client.async_operation().post(`${this.url}/exec`, body);
    }

    // Upload string to file in container
    upload_string(string, path) {
        // TODO - Body used to be returned without content-type:json, check if this is still the case
        return this.client.raw_request({
            method: 'POST',
            url: `${this.url}/files`,
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
            url: `${this.url}/files`,
            qs: { path },
            json: true,
            headers: {
                'X-LXD-type': 'file',
            }
        });

        return new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('end', () => {
                stream.destroy();
                resolve(request);
            });

            stream.pipe(request);
        })
    }

    download(path) {
        return this.client.raw_request({ 
            method: 'GET', 
            url: `${this.url}/files`, 
            qs: { path } 
        })
    }
}

