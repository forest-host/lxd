
import Model from './model.js';

export default class Snapshot extends Model {
    constructor(volume, name) {
        super(volume.client, { name });
        this.volume = volume;
    }

    get url() {
        return `${this.volume.url}/snapshots/${this.name}`;
    }

    async create({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'POST',
            url: `${this.volume.url}/snapshots`,
            json: this.config,
        })

        if(wait) {
            await operation.wait();
        }

        return this
    }

    async destroy({ wait = true } = {}) {
        let operation = await this.client.start_operation({
            method: 'DELETE',
            url: this.url,
        })

        if(wait) {
            await operation.wait();
        }

        return this
    }

    async restore() {
        return this.client.request({
            method: 'PUT',
            url: this.volume.url,
            json: {
                restore: this.name,
            }
        })
    }
}
