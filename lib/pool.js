
import path from 'path';

function Pool(client, name) {
	this.client = client;
	this.name = name;
	this.url = '/storage-pools/' + this.name + '/volumes';
}

Pool.prototype.list = function() {
	return this.client.run_sync_operation('GET', this.url)
		.then(list => {
			return list
				// Only get custom volumes
				.filter(uri => uri.indexOf(this.url + '/custom') != -1)
				// Only get volume names
				.map(uri => path.basename(uri));
		});
};

Pool.prototype.create_volume = function(name) {
	return this.client.run_sync_operation('POST', this.url, {
		config: {},
		name,
		type: 'custom',
	});
};

Pool.prototype.destroy_volume = function(name) {
	return this.client.run_sync_operation('DELETE', this.url + '/custom/' + name)
};

export default Pool;
