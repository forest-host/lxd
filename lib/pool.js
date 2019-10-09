
import path from 'path';

function Pool(client, name) {
	this.client = client;
	this.name = name;
	this.url = '/storage-pools/' + this.name + '/volumes';
}

/**
 * List storage volumes in this pool
 */
Pool.prototype.list = function() {
	return this.client.run_sync_operation({ method: 'GET', path: this.url })
		.then(list => {
			return list
				// Only get custom volumes
				.filter(uri => uri.indexOf(this.url + '/custom') != -1)
				// Only get volume names
				.map(uri => path.basename(uri));
		});
};

/**
 * Create a volume in this storage pool, possibly on cluster target
 */
Pool.prototype.create_volume = function(name, clone_from = undefined) {
	// Volume config
	var config = {
		config: {},
		name,
		type: 'custom',
	};

	// Add source when cloning from other volume
	if(typeof(clone_from) != 'undefined') {
		config.source = {
			pool: this.name,
			name: clone_from,
			type: "copy"
		}
	}

	return this.client.run_sync_operation({ method: 'POST', path: this.url, data: config });
};


/**
 * Destroy a storage volume
 */
Pool.prototype.destroy_volume = function(name) {
	return this.client.run_sync_operation({ method: 'DELETE', path: this.url + '/custom/' + name });
};

/**
 * List snapshots of volume
 */
Pool.prototype.list_snapshots = function(volume_name) {
	return this.client.run_sync_operation({ 
		method: 'GET', 
		path: this.url + '/custom/' + volume_name + '/snapshots', 
	});
};

/**
 * Create a snapshot of a storage volume
 */
Pool.prototype.create_snapshot = function(volume_name, snapshot_name) {
	return this.client.run_async_operation({ 
		method: 'POST', 
		path: this.url + '/custom/' + volume_name + '/snapshots', 
		data: { name: snapshot_name },
	});
};

/**
 * Destroy snapshot
 */
Pool.prototype.destroy_snapshot = function(volume_name, snapshot_name) {
	return this.client.run_sync_operation({
		method: 'DELETE', 
		path: this.url + '/custom/' + volume_name + '/snapshots/' + snapshot_name, 
	});
};


export default Pool;
