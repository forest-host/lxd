
import Syncable from './syncable';

export default class Snapshot extends Syncable {
  constructor(volume, name) {
    super(volume.client, name);
    this.volume = volume;
  }

  url() {
    return `${this.volume.url()}/snapshots/${this.name()}`;
  }

  async create() {
    await this.client.async_operation().post(`${this.volume.url()}/snapshots`, this.config);
    return this.load();
  }

  async destroy() {
    await this.client.async_operation().request('DELETE', this.url());
    return this.unload();
  }

  async restore() {
    await this.client.operation().put(this.volume.url(), { restore: this.name() });

    return this;
  }
}
