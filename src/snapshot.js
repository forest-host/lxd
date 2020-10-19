
export default class Snapshot {
  constructor(volume, name) {
    this.volume = volume;
    return this.set_default_config(name);
  }

  name() {
    return this.config.name;
  }

  set_default_config(name) {
    this.config = { name, };
    this.is_loaded = false;
    return this;
  }

  url() {
    return `${this.volume.url()}/snapshots/${this.name()}`;
  }

  async load() {
    let response = await this.volume.pool.client.operation().get(this.url());
    this.config = response;
    this.is_loaded = true;

    return this;
  }

  // If only we had traits
  unload() {
    return this.set_default_config(this.config.name);
  }

  async create() {
    await this.volume.pool.client.async_operation().post(`${this.volume.url()}/snapshots`, this.config);

    return this.load();
  }

  async destroy() {
    await this.volume.pool.client.async_operation().request('DELETE', this.url());
    return this.unload();
  }

  async restore() {
    await this.volume.pool.client.operation().put(this.volume.url(), { restore: this.name() });

    return this;
  }
}
