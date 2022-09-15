
export default class Model {
    constructor(client, config = {}) {
        this.client = client;
        this.config = config;
        return this
    }

    get name() {
        return this.config.name;
    }
}

