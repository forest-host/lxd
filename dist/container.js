'use strict';

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
 * @param {object} config - Optional: config to pass directly on creation
 */
Container.prototype.create_from_image = function (image, config) {
	var _this = this;

	// Create container
	return this._client._request('POST', '/containers', {
		name: this.name,
		architecture: 'x86_64',
		profiles: ['default'],
		ephemeral: false,
		config: typeof config !== 'undefined' ? config : {},
		source: {
			type: 'image',
			alias: image
		}
	})

	// Return container instance
	.then(function () {
		return _this;
	});
};

// Create and start a new container from image with name
Container.prototype.launch = function (image, config) {
	// Create container
	return this.create_from_image(image, config)
	// Start container
	.then(function (container) {
		return container.start();
	});
};

Container.prototype._action = function (action, force) {
	var _this2 = this;

	if (typeof force === 'undefined') {
		force = false;
	}

	return this._client._request('PUT', '/containers/' + this.name + '/state', {
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
	return this._action('start');
};

// Stop this container
Container.prototype.stop = function () {
	return this._action('stop');
};

// Delete this container
Container.prototype.delete = function () {
	var _this3 = this;

	return this.stop().then(function () {
		return _this3._client._request('DELETE', '/containers/' + _this3.name);
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

	return this._client._request('PUT', '/containers/' + this.name, config).then(function () {
		return _this5.get_info();
	});
};

// Get config of this container from lxc list
Container.prototype.get_info = function () {
	return this._client._request('GET', '/containers/' + this.name);
};

// Get state of container
Container.prototype.get_state = function () {
	return this._client._request('GET', '/containers/' + this.name + '/state');
};

Container.prototype.get_ipv4_addresses = function () {
	return this.get_state().then(function (state) {
		return state.network.eth0.addresses.filter(function (address) {
			return address.family == 'inet';
		});
	});
};

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

		return addresses[0];
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
	return this._client._request('POST', '/containers/' + this.name + '/exec', {
		command: ['/bin/bash', '-c', cmd],
		environment: options.environment || {},
		'wait-for-websocket': true,
		interactive: false
	});
};

// Add mount
Container.prototype.mount = function (source, path, name) {
	var config = { devices: {} };

	config.devices[name] = {
		source: source,
		path: path,
		type: 'disk'
	};

	return this.patch(config);
};

Container.prototype.unmount = function (name) {
	var _this7 = this;

	return this.get_info().then(function (info) {
		delete info.devices[name];

		return _this7.update(info);
	});
};

Container.prototype.upload = function (source, path) {
	return this._client._request('POST', '/containers/' + this.name + '/files?path=' + path, _fs2.default.createReadStream(source));
};

module.exports = Container;