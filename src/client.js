
import WebSocket from 'ws';
import path from 'path';
import fs from 'fs';
import got, { Options } from 'got'

import { Operation } from './operation.js';
import Container from './container.js';
import Pool from './pool.js';


export default class Client {
    constructor(config) {
        // GOT options
        this.base_url = `${config.host}:${config.port}/1.0/`
        this.options = new Options({
            prefixUrl: `https://${this.base_url}`,
            https: {
                certificate: fs.readFileSync(config.cert),
                key: fs.readFileSync(config.key),
                // Allow self-signed certs
                rejectUnauthorized: false,
            }
        });
    }

    // Get global LXD events listener 
    open_socket(url) {
        return new WebSocket(`wss://${this.base_url}${url}`, { rejectUnauthorized: false });
    }

    request(config, options = undefined) {
        return got(config, options, this.options)
    }

    // Launch operation in LXD
    start_operation() {
        let operation = new Operation(this)
        return operation.request(...arguments)
    }

    // Get LXD storage pool representation
    get_pool(name) {
        return new Pool(this, name);
    }

    // Get LXD container representation
    get_container(name) {
        return new Container(this, name);
    }

    // Get list of containers
    async list() {
        let response = await this.request({ method: 'GET', url: 'containers' }).json()
        return response.metadata.map(url => path.basename(url));
    }
}
