
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

  raw_request(config) {
    config.url = `https://${this.config.base_url}${config.url}`;
    config.agentOptions = this.agentOptions;
    return request(config);
  }

  request(method, url, body, qs) {
    // Set url
    let config = { 
      agentOptions: this.agentOptions,
      json: true,
      method,
      url: `https://${this.config.base_url}${url}`,
    };
    
    if(typeof(body) === 'object') {
      config.body = body;
    }

    if(typeof(qs) === 'object') {
      config.qs = qs;
    }

    if(config.hasOwnProperty('qs')) {
      console.log(require('util').inspect(config, false, null));
    }

    // Actually make the request
    return request(config);
  }

  operation(url) {
    return new Operation(this);
  }

  async_operation(url) {
    return new AsyncOperation(this);
  }
  
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
