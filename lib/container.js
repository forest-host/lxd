
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
	this._client = client;
	this.name = name;
};

/**
 * Create container from lxc image
 * @param {string} image - Image to create container from
 * @param {object} config - Config to pass directly on creation
 * @param {object} profiles - Array of profiles to be applied to container
 */
Container.prototype.create_from_image = function(image, config, profiles) {
	// Setup data
	var body = {
		name: this.name,
		architecture: 'x86_64',
		profiles: profiles || ['default'],
		ephemeral: false,
		config: typeof(config) !== 'undefined' ? config : {},
		source: {
			type: 'image',
			alias: image,
		}
	};

	// Create container
	return this._client._request('POST', '/containers', body)

	// Return container instance
	.then(() => this)
}

// Create and start a new container from image with name
Container.prototype.launch = function(image, config, profiles) {
	// Create container
	return this.create_from_image(image, config, profiles)
		// Start container
		.then(container => container.start());
};

/**
 * Execute an action on container
 * @param {String} action - Action to execute
 * @param {Boolean} force - Whether to force execution
 */
Container.prototype._action = function(action, force) {
	if(typeof(force) === 'undefined') {
		force = false;
	}

	return this._client._request('PUT', '/containers/'+this.name+'/state', {
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
	return this._action('start');
};

// Stop this container
Container.prototype.stop = function() {
	return this._action('stop', true);
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
		.then(() => this._client._request('DELETE', '/containers/'+this.name));
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
	return this._client._request('PUT', '/containers/'+this.name, config)
		.then(() => this)
}


// Get config of this container from lxc list
Container.prototype.get_info = function() {
	return this._client._request('GET', '/containers/'+this.name);
};

// Get state of container
Container.prototype.get_state = function() {
	return this._client._request('GET', '/containers/'+this.name+'/state');
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
	return this._client._request('POST', '/containers/'+this.name+'/exec', {
		command: ['/bin/bash', '-c', cmd],
		environment: options.environment || {},
		'wait-for-websocket': true,
		interactive: false,
	});
};

/**
 * Mount host path in container
 * @param {string} source - Source path on host to mount in container
 * @param {string} path - Path in container to mount on
 * @param {string} name - Name of mount
 */
Container.prototype.mount = function(source, path, name) {
	var config = { devices: {} };

	config.devices[name] = {
		source: source,
		path: path,
		type: 'disk',
	};

	return this.patch(config);
};

/**
 * Unmount a device from container
 * @param {String} name - Name of mounted device
 */
Container.prototype.unmount = function(name) {
	return this.get_info()
		.then(info => {
			delete info.devices[name];

			return this.update(info);
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
	return this._client._request(
		'POST', 
		'/containers/' + this.name + '/files?path=' + path,
		typeof(content) === 'string' ? create_stream_from_string(content) : content
	);
};

module.exports = Container;
