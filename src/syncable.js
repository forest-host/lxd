
export default class Syncable {
    constructor(client, name) {
        this.client = client;
        return this.set_default_config(name);
    }

    name() {
        return this.config.name;
    }

    // This is a default function that can be overridden from children
    set_default_config(name) {
        this.config = { name, };
        return this.set_synced(false);
    }

    // Mark if currently loaded config is synced with LXD backend
    set_synced(is_synced) {
        this.is_synced = is_synced;
        return this;
    }

    async load() {
        this.config = await this.client.operation().get(this.url());
        return this.set_synced(true);
    }

    // Load default config, removing information that was fetched from API
    unload() {
        return this.set_default_config(this.config.name);
    }
}

