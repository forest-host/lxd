
import path from 'path';
import fs from 'fs';
import request from 'request-promise-native';
import WebSocket from 'ws';

import { Operation } from './operation';
import Container from './container';
import Pool from './pool';

export default class Client {
    constructor(config) {
        this.config = config;
        // Add defaults
        this.config.api_version = '1.0';
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

    // Get global LXD events listener 
    open_socket(url) {
        return new WebSocket(`wss://${this.config.base_url}${url}`, this.agentOptions);
    }

    // Raw request function that will pass on config to request lib
    request(config) {
        config.url = `https://${this.config.base_url}${config.url}`;
        config.agentOptions = this.agentOptions;

        return request(config);
    }

    // Launch operation in LXD
    async create_operation() {
        let response = await this.request(...arguments)
        return Operation(this, response)
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
        let list = await this.operation().get('/containers');
        return list.map(url => path.basename(url));
    }
}
