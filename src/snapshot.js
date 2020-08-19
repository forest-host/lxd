
export default class Snapshot {
  constructor(volume, name) {
    this.volume = volume;
    this.name = name;
  }

  url() {
    return `${this.volume.url()}/snapshots/${this.name}`;
  }

  async load() {
    let response = await this.volume.pool.client.operation().get(this.url());
    this.config = response;

    return this;
  }

  async create() {
    await this.volume.pool.client.async_operation().post(`${this.volume.url()}/snapshots`, { name: this.name });

    return this.load();
  }

  async destroy() {
    await this.volume.pool.client.operation().delete(this.url());
    delete this.config;

    return this;
  }
}
