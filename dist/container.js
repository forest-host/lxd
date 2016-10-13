'use strict';

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Check if paths are not relative
/*
var validate_paths = (host_path, container_path) => {
	if(host_path.substring(0, 1) == '.' || container_path.substring(0, 1) == '.') {
		return Promise.reject(new Error('This function does not support relative paths'));
	} else {
		return Promise.resolve();
	}
};
*/

var Container = function (client, name) {
	this._client = client;
	this.name = name;
};

Container.prototype._action = function (action) {
	var _this = this;

	return this._client._request('PUT', '/containers/' + this.name + '/state', {
		action: action,
		timeout: 30,
		force: true
	}).then(function (res) {
		if (res.err) {
			throw new Error(res.err);
		}
		return _this;
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
Container.prototype.destroy = function () {
	var _this2 = this;

	return this.stop().then(function () {
		return _this2._client._request('DELETE', '/containers/' + _this2.name);
	});
};

// Update container config
Container.prototype.update = function (data) {
	var _this3 = this;

	return this.info().then(function (info) {
		return _lodash2.default.merge(info, data);
	}).then(function (data) {
		return _this3._client._request('PUT', '/containers/' + _this3.name, data);
	}).then(function () {
		return _this3.info();
	});
};

// Get config of this container from lxc list
Container.prototype.info = function () {
	return this._client._request('GET', '/containers/' + this.name);
};

// Get state of container
Container.prototype.state = function () {
	return this._client._request('GET', '/containers/' + this.name + '/state');
};

Container.prototype.wait_for_dhcp = function () {
	var _this4 = this;

	return this.state().then(function (state) {
		return state.network.eth0.addresses.filter(function (address) {
			return address.family == 'inet';
		});
	}).then(function (addresses) {
		if (!addresses.length) {
			// Wait for 500 ms, then try again
			return new _bluebird2.default(function (resolve) {
				return setTimeout(resolve, 500);
			}).then(function () {
				return _this4.wait_for_dhcp();
			});
		}

		return addresses[0];
	});
};

// Execute command in container
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
		environment: {},
		'wait-for-websocket': true,
		interactive: false
	});
};

/*
// Copy data from container to host
Container.prototype.download = function(container_path, host_path) {
	// Check for relative paths
	return validate_paths(host_path, container_path)
		.then(() => {
			var container_basename = path.basename(container_path);
			var host_basename = container_basename;

			// Get correct host path
			if(host_path.substring(host_path.length - 1) != '/') {
				host_basename = path.basename(host_path);
				host_path = path.dirname(host_path) + '/';
			}

			// Setup vars
			var dirname = path.dirname(container_path);
			var options = { cwd: dirname };
			var archive = container_basename + '.tar.gz';

			// Check if paths are valid
			return Promise.all([
				this._client.path_lacks(host_path + host_basename),
				this.path_exists(dirname + '/' + container_basename)
			])

				// Create archive in container
				.then(() => this.exec('tar', ['cfz', archive, container_basename], options))

				// Make sure target exists & copy archive to host
				.then(() => exec('mkdir', ['-p', host_path]))
				.then(() => exec('lxc', ['file', 'pull', this.name + '/' + dirname + '/' + archive, host_path]))

				// Extract archive on host & rename it if needed
				.then(() => exec('tar', ['xfz', archive], { cwd: host_path }))
				.then(() => {
					if(host_basename != container_basename) {
						// TODO name conflicts? Rename on container?
						return exec('mv', [container_basename, host_basename], { cwd: host_path });
					}
				})

				// Remove archive on host & remove archive in container
				.then(() => exec('rm', [archive], { cwd: host_path }))
				.then(() => this.exec('rm', [archive], options));
		});
};

// TODO - support relative paths?
// Copy data from host to container with name
Container.prototype.upload = function(host_path, container_path) {
	// Check for relative paths
	return validate_paths(host_path, container_path)
		.then(() => {
			// Setup names of directories and archive
			var host_basename = path.basename(host_path);
			var container_basename = host_basename;
			var archive = host_basename + '.tar.gz';

			// Get correct container path
			if(container_path.substring(container_path.length - 1) != '/') {
				container_basename = path.basename(container_path);
				container_path = path.dirname(container_path) + '/';
			}

			// Setup working dirs for host and container
			var host_options = { cwd: path.dirname(host_path) };
			var container_options = { cwd: container_path };

			return Promise.all([
				this._client.path_exists(host_path),
				this.path_lacks(container_path + container_basename),
			])

				// Create archive on host
				.then(() => exec('tar', ['cfz', archive, host_basename], host_options))

				// Push file to container
				.then(() => exec('lxc', ['file', 'push', archive, this.name + '/' + container_path], host_options))

				// Extract archive in container and move it to desired path when required
				.then(() => this.exec('tar', ['xfz', archive], container_options))
				.then(() => {
					if(host_basename != container_basename) {
						return this.exec('mv', [host_basename, container_basename], container_options);
					}
				})

				// Remove archive from container and from host
				.then(() => this.exec('rm', [archive], container_options))
				.then(() => exec('rm', [archive], host_options));
		});
};

// Check if path exists in container
Container.prototype.path_exists = function(path) {
	return this.exec('stat', [path])
		.catch(() => {
			throw new Error('Path ' + path + ' in container does not exist');
		});
};

// Check if container path does not exist
Container.prototype.path_lacks = function(path) {
	return new Promise((resolve, reject) => {
		this.exec('stat', [path])
			.then(() => reject(new Error('Path ' + path + ' on container exists')))
			.catch(() => resolve());
	});
};
*/

// Add mount
// TODO - mount NFS directly in container
Container.prototype.add_disk = function (name, source, path) {
	var _this5 = this;

	var data = { devices: {} };

	data.devices[name] = {
		source: source,
		path: path,
		type: 'disk'
	};

	return this.update(data).then(function () {
		return _this5;
	});
};

//Container.prototype.remove_disk = function(name) {

//};

module.exports = Container;