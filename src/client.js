
import path from 'path';
import stream from 'stream';
import fs from 'fs';
import request from 'request-promise-native';
import WebSocket from 'ws';

import { AsyncOperation, Operation } from './operation';
import Container from './container';
import Image from './image';
import Pool from './pool';
import { map_series, wait_for_socket_open } from './util';

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
  raw_request(config) {
    config.url = `https://${this.config.base_url}${config.url}`;
    config.agentOptions = this.agentOptions;
    return request(config);
  }

  // Simple request with body & query string
  request(method, url, body, qs) {
    // Set url
    let config = { json: true, method, url, };
    
    if(typeof(body) === 'object') {
      config.body = body;
    }
    if(typeof(qs) === 'object') {
      config.qs = qs;
    }

    // Actually make the request
    return this.raw_request(config);
  }

  // Run sync operation
  operation(url) {
    return new Operation(this);
  }

  // Run async operation
  async_operation(url) {
    return new AsyncOperation(this);
  }
  
  // Get LXD storage pool representation
  get_pool(name) {
    return new Pool(this, name);
  }

  // Get LXD container representation
  get_container(name) {
    return new Container(this, name);
  }

  get_image(fingerprint = null) {
    return new Image(this, fingerprint);
  }

  // Get list of images
  async list_images() {
    return this.operation().get('/images');
  }

  // Get list of containers
  async list() {
    let list = await this.operation().get('/containers');
    return list.map(url => path.basename(url));
  }
}
