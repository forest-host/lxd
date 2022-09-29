
export default class Model {
    constructor(client, config = {}) {
        this.client = client;
        this.config = config;
        return this
    }

    get name() {
        return this.config.name;
    }

    get url() {
        throw new Error('Override the Model.url() method.')
    }

    async get() {
        let response = await this.client.request({ url: this.url }).json()
        return response.metadata
    }
}

