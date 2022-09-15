
export default class Model {
    constructor(client, config = {}) {
        this.client = client;
        this.config = config;
        return this
    }

    get name() {
        return this.config.name;
    }

    async load() {
        this.config = await this.client.operation().get(this.url);
        return this
    }

    // Load default config, removing information that was fetched from API
    unload() {
        this.config = { name: this.config.name }
        return this
    }
}

