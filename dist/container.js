'use strict';

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

var _stream = require('stream');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
 * @param {string} image - Image to create container from
 * @param {object} config - Config to pass directly on creation
 * @param {object} profiles - Array of profiles to be applied to container
 */
Container.prototype.create_from_image = function (image, config, profiles) {
	var _this = this;

	// Setup data
	var body = {
		name: this.name,
		architecture: 'x86_64',
		profiles: profiles || ['default'],
		ephemeral: false,
		config: typeof config !== 'undefined' ? config : {},
		source: {
			type: 'image',
			alias: image
		}
	};

	// Create container
	return this.client.run_async_operation('POST', '/containers', body)

	// Return container instance
	.then(function () {
		return _this;
	});
};

// Create and start a new container from image with name
Container.prototype.launch = function (image, config, profiles) {
	// Create container
	return this.create_from_image(image, config, profiles)
	// Start container
	.then(function (container) {
		return container.start();
	});
};

/**
 * Execute an action on container
 * @param {String} action - Action to execute
 * @param {Boolean} force - Whether to force execution
 */
Container.prototype.action = function (action, force) {
	var _this2 = this;

	if (typeof force === 'undefined') {
		force = false;
	}

	return this.client.run_async_operation('PUT', '/containers/' + this.name + '/state', {
		action: action,
		timeout: 30,
		force: force
	}).then(function (res) {
		if (res.err) {
			throw new Error(res.err);
		}
		return _this2;
	});
};

// Start this container
Container.prototype.start = function () {
	return this.action('start');
};

// Stop this container
Container.prototype.stop = function () {
	return this.action('stop', true);
};

/**
 * Delete container
 */
Container.prototype.delete = function () {
	var _this3 = this;

	return this.stop().catch(function (err) {
		// That's okay
		if (err.message.indexOf('already stopped') != -1) {
			return;
		}
		if (err.message.indexOf('Container is not running') != -1) {
			return;
		}

		throw err;
	}).then(function () {
		return _this3.client.run_async_operation('DELETE', '/containers/' + _this3.name);
	});
};

/**
 * Patch container config
 * @param {Object} config - Partial config to set on container
 */
Container.prototype.patch = function (config) {
	var _this4 = this;

	return this.get_info().then(function (info) {
		return _this4.update((0, _extend2.default)(true, info, config));
	});
};

/**
 * Update container config
 * @param {Object} config - Full container info config to pass to container
 */
Container.prototype.update = function (config) {
	var _this5 = this;

	return this.client.run_async_operation('PUT', '/containers/' + this.name, config).then(function () {
		return _this5;
	});
};

// Get config of this container from lxc list
Container.prototype.get_info = function () {
	return this.client.run_sync_operation('GET', '/containers/' + this.name);
};

// Get state of container
Container.prototype.get_state = function () {
	return this.client.run_sync_operation('GET', '/containers/' + this.name + '/state');
};

Container.prototype.get_ipv4_addresses = function () {
	return this.get_state().then(function (state) {
		return state.network.eth0.addresses.filter(function (address) {
			return address.family == 'inet';
		});
	});
};

// TODO - this can take forever when dhcp is down
// Implement max_tries to fix this
/**
 * Resolve a promise when container has aquired a ip address
 */
Container.prototype.wait_for_dhcp = function () {
	var _this6 = this;

	return this.get_ipv4_addresses().then(function (addresses) {
		if (!addresses.length) {
			// Wait for 500 ms, then try again
			return new _bluebird2.default(function (resolve) {
				return setTimeout(resolve, 500);
			}).then(function () {
				return _this6.wait_for_dhcp();
			});
		}

		return _this6;
	});
};

/**
 * Execute a command in the container
 * @param {string} cmd - Command to be executed in 
 * @param {Array} args - Array containing arguments for command
 * @param {Object} options - Object containing working directory
 */
Container.prototype.exec = function (cmd, args, options) {
	// Get correct options
	var last = arguments[arguments.length - 1];
	options = last === Object(last) ? last : {};

	// Change dir before command execution if cwd is set
	cmd = 'cwd' in options ? 'cd ' + options.cwd + '; ' + cmd : cmd;

	// Get correct args
	args = Array.isArray(arguments[1]) ? arguments[1] : [];

	// Add args to cmd
	cmd += args.length ? ' ' + args.join(' ') : '';

	// Run command with joined args on container
	return this.client.run_async_operation('POST', '/containers/' + this.name + '/exec', {
		command: ['/bin/bash', '-c', cmd],
		environment: options.environment || {},
		'wait-for-websocket': true,
		interactive: false
	});
};

/**
 * Reduce variables to lxc config object
 */
function get_variables_as_config(variables) {
	// Return undefined to not set anything when no vars are set
	if (typeof variables == 'undefined') {
		return undefined;
	}

	return Object.keys(variables).reduce(function (aggregate, name) {
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
	return mounts.reduce(function (aggregate, mount) {
		aggregate[mount.name] = {
			source: mount.source,
			path: mount.path,
			type: 'disk'
		};
		return aggregate;
	}, {});
}

/**
 * Add variables & mounts to container
 */
Container.prototype.update_config = function (variables, mounts) {
	return this.patch({
		config: get_variables_as_config(variables),
		devices: get_mounts_as_devices(mounts)
	});
};

/**
 * Creat readable stream from string
 * @param {String} string - string to convert to stream
 */
function create_stream_from_string(string) {
	var stream = new _stream.Readable();
	stream.push(string);
	stream.push(null);

	return stream;
}

/**
 * Upload content to file in container
 * @param {Mixed} content - String or read stream to upload
 * @param {String} path - Path in container to put content
 */
Container.prototype.upload = function (content, path) {
	return this.client.run_sync_operation('POST', '/containers/' + this.name + '/files?path=' + path, typeof content === 'string' ? create_stream_from_string(content) : content);
};

module.exports = Container;