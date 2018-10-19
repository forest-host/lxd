
import Promise from 'bluebird';
import extend from 'extend';
import { Readable as readable } from 'stream';

/**
 * Represents a lxc container
 * @constructor
 * @param {Client} client - LXC client container will use to talk to lxd api.
 * @param {string} name - Name of the container we will operate on.
 */
function Container(client, name) {
	this.client = client;
	this.name = name;
};

/**
 * Create container from lxc image
 * @param {object} config - Post body to pass directly on creation
 */
Container.prototype.create_from_image = function(config, target) {
	// Setup data
	var defaults = {
		name: this.name,
		architecture: 'x86_64',
		profiles: [ 'default' ],
		ephemeral: false,
	};

	// Build query string
	var qs = {};
	if(typeof(target) !== 'undefined') {
		qs.target = target;
	};

	// Create container
	return this.client.run_async_operation('POST', '/containers', Object.assign(defaults, config), qs)

	// Return container instance
	.then(() => this)
}

// Create and start a new container from image with name
Container.prototype.launch = function(config, target) {
	// Create container
	return this.create_from_image(config, target)
		// Start container
		.then(container => container.start());
};

/**
 * Execute an action on container
 * @param {String} action - Action to execute
 * @param {Boolean} force - Whether to force execution
 */
Container.prototype.action = function(action, force) {
	if(typeof(force) === 'undefined') {
		force = false;
	}

	return this.client.run_async_operation('PUT', '/containers/'+this.name+'/state', {
		action: action,
		timeout: 30,
		force: force,
	})
	.then(res => {
		if(res.err) {
			throw new Error(res.err);
		}
		return this;
	});
};

// Start this container
Container.prototype.start = function() {
	return this.action('start');
};

// Stop this container
Container.prototype.stop = function() {
	return this.action('stop');
};

/**
 * Delete container
 */
Container.prototype.delete = function() {
	return this.stop()
		.catch(err => {
			// That's okay
			if(err.message.indexOf('already stopped') != -1) {
				return;
			}
			if(err.message.indexOf('Container is not running') != -1) {
				return;
			}
	
			throw err;
		})
		.then(() => this.client.run_async_operation('DELETE', '/containers/'+this.name));
};

/**
 * Patch container config
 * @param {Object} config - Partial config to set on container
 */
Container.prototype.patch = function(config) {
	return this.get_info()
		.then(info => this.update(extend(true, info, config)))
};

/**
 * Update container config
 * @param {Object} config - Full container info config to pass to container
 */
Container.prototype.update = function(config) {
	return this.client.run_async_operation('PUT', '/containers/'+this.name, config)
		.then(() => this)
}


// Get config of this container from lxc list
Container.prototype.get_info = function() {
	return this.client.run_sync_operation('GET', '/containers/'+this.name);
};

// Get state of container
Container.prototype.get_state = function() {
	return this.client.run_sync_operation('GET', '/containers/'+this.name+'/state');
};

Container.prototype.get_ipv4_addresses = function() {
	return this.get_state()
		.then(state => {
			return state.network.eth0.addresses.filter(address => {
				return address.family == 'inet';
			});
		});
}

// TODO - this can take forever when dhcp is down
// Implement max_tries to fix this
/**
 * Resolve a promise when container has aquired a ip address
 */
Container.prototype.wait_for_dhcp = function() {
	return this.get_ipv4_addresses()
		.then(addresses => {
			if( ! addresses.length) {
				// Wait for 500 ms, then try again
				return new Promise((resolve) => setTimeout(resolve, 500))
					.then(() => this.wait_for_dhcp());
			}

			return this;
		});
};

/**
 * Execute a command in the container
 * @param {string} cmd - Command to be executed in 
 * @param {Array} args - Array containing arguments for command
 * @param {Object} options - Object containing working directory
 */
Container.prototype.exec = function(cmd, args, options) {
	// Get correct options
	var last = arguments[arguments.length - 1];
	options = last === Object(last) ? last : {};

	// Change dir before command execution if cwd is set
	cmd = 'cwd' in options ? 'cd '+options.cwd+'; '+cmd : cmd;

	// Get correct args
	args = Array.isArray(arguments[1]) ? arguments[1] : [];

	// Add args to cmd
	cmd += args.length ? ' '+args.join(' ') : '';

	// Run command with joined args on container
	return this.client.run_async_operation('POST', '/containers/'+this.name+'/exec', {
		command: ['/bin/bash', '-c', cmd],
		environment: options.environment || {},
		'wait-for-websocket': true,
		interactive: false,
	});
};

/**
 * Reduce variables to lxc config object
 */
function get_variables_as_config(variables) {
	// Return undefined to not set anything when no vars are set
	if(typeof(variables) == 'undefined') {
		return undefined;
	}

	return Object.keys(variables).reduce((aggregate, name) => {
		// Set correct config key & value
		aggregate['environment.' + name] = variables[name];
		// Return object
		return aggregate;
	}, {});
}

/**
 * Reduce mounts array to lxc devices object
 */
function get_mounts_as_devices(mounts) {
	return mounts.reduce((aggregate, mount) => {
		aggregate[mount.name] = {
			source: mount.source,
			path: mount.path,
			type: 'disk',
		};
		return aggregate;
	}, {});
}

/**
 * Reduce volumes array to lxc device object
 */
function get_volumes_as_devices(volumes) {
	return volumes.reduce((aggregate, volume) => {
		aggregate[volume.name] = {
			path: volume.path,
			source: volume.volume,
			pool: volume.pool,
			type: 'disk',
		};
		return aggregate;
	}, {});
}

/**
 * Add variables & mounts to container
 */
Container.prototype.update_config = function(variables, mounts, volumes) {
	return this.patch({
		config: get_variables_as_config(variables),
		devices: Object.assign(get_mounts_as_devices(mounts || []), get_volumes_as_devices(volumes || [])),
	});
};

/**
 * Creat readable stream from string
 * @param {String} string - string to convert to stream
 */
function create_stream_from_string(string) {
	var stream = new readable;
	stream.push(string);
	stream.push(null);

	return stream;
}

/**
 * Upload content to file in container
 * @param {Mixed} content - String or read stream to upload
 * @param {String} path - Path in container to put content
 */
Container.prototype.upload = function(content, path) {
	return this.client.run_sync_operation(
		'POST', 
		'/containers/' + this.name + '/files',
		// Post file content
		typeof(content) === 'string' ? create_stream_from_string(content) : content,
		// Path of file in query string
		{ path: path, }
	);
};

module.exports = Container;
