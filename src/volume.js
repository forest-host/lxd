
import path from 'path';

import Snapshot from './snapshot';

export default class Volume {
  constructor(pool, name) {
    this.pool = pool;
    this.name = name;
  }

  url() {
    return `${this.pool.url()}/${this.name}`
  }

  async load() {
    let response = await this.pool.client.operation().get(this.url());
    this.config = response;

    return this;
  }

  async create() {
    await this.pool.client.operation().post(this.pool.url(), { name: this.name });
    return this.load();
  }

  async destroy() {
    await this.pool.client.operation().delete(this.url());
    delete this.config;

    return this;
  }

  async clone_from(volume) {
    /*
      // Volume config
      var config = {
        config: {},
        name,
        //type: "custom",
      };

      // Add source when cloning from other volume
      if(typeof(clone_from) != 'undefined') {
        if(typeof(clone_from) == 'string') {
          config.source = {
            pool: this.name,
            name: clone_from,
            type: "copy",
            volume_only: true,
          }
        } else if (typeof(clone_from) == 'object' && clone_from.hasOwnProperty('name') && clone_from.hasOwnProperty('storage_pool')) {
          config.source = {
            pool: clone_from.storage_pool,
            name: clone_from.name,
            type: "copy",
            volume_only: true,
          }
        }
      }

      return this.client.run_operation({ method: 'POST', url: this.url + '/custom', body: config });
    */
  
  }

  get_snapshot(name) {
    return new Snapshot(this, name);
  }

  async list_snapshots() {
    let list = await this.pool.client.operation().get(`${this.url()}/snapshots`);
    return list.map(url => path.basename(url));
  }
}
