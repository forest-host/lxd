
import path from 'path';

import Model from './model.js';
import Snapshot from './snapshot.js';
import Backup from './backup.js';

export default class Volume extends Model {
    constructor(pool, name) {
        super(pool.client, { name });
        this.pool = pool;
    }

    get url() {
        return `${this.pool.url}/${this.name}`
    }

    async create({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'POST',
            url: this.pool.url,
            json: this.config
        })

        if(wait) {
            await operation.wait()
        }

        return this
    }

    async destroy({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'DELETE',
            url: this.url
        })

        if(wait) {
            await operation.wait()
        }

        return this
    }

    // Clone from other volume on creating this volume
    clone_from({ source, volume_only = true, wait = true } = {}) {
        this.config.source = {
            name: source.name,
            pool: source.pool.name,
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
        let list = await this.pool.client.request({ url: `${this.url}/snapshots` }).json()
        return list.map(url => path.basename(url));
    }

    get_backup(name) {
        return new Backup(this, name);
    }

    async list_backups() {
        let list = await this.pool.client.request({ url:`${this.url}/backups` }).json()
        return list.map(url => path.basename(url));
    }
}
