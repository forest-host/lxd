
import Syncable from './syncable';

export default class Backup extends Syncable {
  constructor(volume, name) {
    super(volume.client, name);
    this.volume = volume;
  }


  set_default_config(name) {
    this.config = {
      name,
      volume_only: true,
      optimized_storage: true,
    };
    return this.set_synced(false);
  }

  url() {
    return `${this.volume.url()}/backups/${this.name()}`;
  }

  async create() {
    await this.client.async_operation().post(`${this.volume.url()}/backups`, this.config);
    return this.load();
  }

  async destroy() {
    await this.client.async_operation().request('DELETE', this.url());
    return this.unload();
  }

  download() {
    return this.client.raw_request({ method: 'GET', url: `${this.url()}/export` })
  }
}
