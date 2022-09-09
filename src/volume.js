
import path from 'path';

import Model from './model';
import Snapshot from './snapshot';
import Backup from './backup';

export default class Volume extends Model {
    constructor(pool, name) {
        super(pool.client, { name });
        this.pool = pool;
    }

    url() {
        return `${this.pool.url()}/${this.name()}`
    }

    async create() {
        await this.client.operation().post(this.pool.url(), this.config);
        return this.load();
    }

    async destroy() {
        await this.client.operation().delete(this.url());
        return this.unload();
    }

    // Clone from other volume on creating this volume
    clone_from(source, volume_only = true) {
        this.config.source = {
            name: source.name(),
            pool: source.pool.name(),
            type: 'copy',
            // We generally don't want to copy snapshots
            volume_only,
        };

        return this.create();
    }

    get_snapshot(name) {
        return new Snapshot(this, name);
    }

    async list_snapshots() {
        let list = await this.pool.client.operation().get(`${this.url()}/snapshots`);
        return list.map(url => path.basename(url));
    }

    get_backup(name) {
        return new Backup(this, name);
    }

    async list_backups() {
        let list = await this.pool.client.operation().get(`${this.url()}/backups`);
        return list.map(url => path.basename(url));
    }
}
