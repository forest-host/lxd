
import Model from './model';

export default class Backup extends Model {
    constructor(volume, name) {
        super(volume.client, {
            name,
            volume_only: true,
            optimized_storage: true,
        });
        this.volume = volume;
    }

    url() {
        return `${this.volume.url()}/backups/${this.name()}`;
    }

    async create() {
        // TODO - make async op return conf
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
