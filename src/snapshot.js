
export default class Snapshot {
  constructor(volume, name) {
    this.volume = volume;
    this.name = name;
  }

  url() {
    return `${this.volume.url()}/snapshots/${this.name}`;
  }

  async load() {
    let response = await this.volume.pool.client.run_operation({ url: this.url() })
    this.config = response;

    return this;
  }

  async create() {
    await this.volume.pool.client.run_async_operation({ 
      method: 'POST', 
      url: `${this.volume.url()}/snapshots`,
      body: { name: this.name },
    });

    return this.load();
  }

  async destroy() {
    await this.volume.pool.client.run_operation({ method: 'DELETE', url: this.url() });
    delete this.config;

    return this;
  }
}
