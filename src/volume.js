
import path from 'path';

import Snapshot from './snapshot';

export default class Volume {
  constructor(pool, name) {
    this.pool = pool;
    return this.set_default_config(name);
  }

  set_default_config(name) {
    this.config = { name, };
    this.is_loaded = false;
    return this;
  }

  name() {
    return this.config.name;
  }

  url() {
    return `${this.pool.url()}/${this.name()}`
  }

  async load() {
    let response = await this.pool.client.operation().get(this.url());
    this.config = response;
    this.is_loaded = true;

    return this;
  }

  unload() {
    return this.set_default_config(this.config.name);
  }

  async create() {
    await this.pool.client.operation().post(this.pool.url(), this.config);
    return this.load();
  }

  async destroy() {
    await this.pool.client.operation().delete(this.url());
    return this.unload();
  }

  clone_from(volume, volume_only = true) {
    this.config.source = {
      name: volume.name(),
      pool: volume.pool.name(),
      type: 'copy',
      // We generally don't want to copy snapshots
      volume_only,
    };

    return this;
  }

  get_snapshot(name) {
    return new Snapshot(this, name);
  }

  async list_snapshots() {
    let list = await this.pool.client.operation().get(`${this.url()}/snapshots`);
    return list.map(url => path.basename(url));
  }
}
