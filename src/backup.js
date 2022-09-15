
import Model from './model.js';

export default class Backup extends Model {
    constructor(volume, name) {
        super(volume.client, {
            name,
            volume_only: true,
            optimized_storage: true,
        });
        this.volume = volume;
    }

    get url() {
        return `${this.volume.url}/backups/${this.name}`;
    }

    async create({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'POST',
            url: `${this.volume.url}/backups`,
            json: this.config,
        })

        if (wait) {
            await operation.wait()
        }

        return this
    }

    async destroy({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'DELETE',
            url: this.url,
        })

        if (wait) {
            await operation.wait()
        }

        return this
    }

    // TODO - This should be streamed
    //download() {
        //return this.client.request({ method: 'GET', url: `${this.url}/export` })
    //}
}
