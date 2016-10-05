'use strict';

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _utilities = require('utilities');

var _utilities2 = _interopRequireDefault(_utilities);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Check if paths are not relative
var validate_paths = function (host_path, container_path) {
	if (host_path.substring(0, 1) == '.' || container_path.substring(0, 1) == '.') {
		return _bluebird2.default.reject(new Error('This function does not support relative paths'));
	} else {
		return _bluebird2.default.resolve();
	}
};

var Container = function (host, name) {
	this.host = host;
	this.name = name;
};

// Execute command in container
Container.prototype.exec = function (cmd, options) {
	var command = '';

	// Catch empty options
	options = options || {};

	// Change to working dir
	if ('cwd' in options) {
		command += 'cd ' + options.cwd + '; ';
	}

	// Escape string
	command += cmd;

	// Run all of it in designated container
	return (0, _utilities2.default)('lxc', ['exec', this.name, '--', '/bin/bash', '-c', command]);
};

// Copy data from container to host
Container.prototype.download = function (container_path, host_path) {
	var _this = this;

	// Check for relative paths
	return validate_paths(host_path, container_path).then(function () {
		var container_basename = _path2.default.basename(container_path);
		var host_basename = container_basename;

		// Get correct host path
		if (host_path.substring(host_path.length - 1) != '/') {
			host_basename = _path2.default.basename(host_path);
			host_path = _path2.default.dirname(host_path) + '/';
		}

		// Setup vars
		var dirname = _path2.default.dirname(container_path);
		var options = { cwd: dirname };
		var archive = container_basename + '.tar.gz';

		// Check if paths are valid
		return _bluebird2.default.all([_this.host.path_lacks(host_path + host_basename), _this.path_exists(dirname + '/' + container_basename)])

		// Create archive in container
		.then(function () {
			return _this.exec('tar cfz ' + archive + ' ' + container_basename, options);
		})

		// Make sure target exists & copy archive to host
		.then(function () {
			return (0, _utilities2.default)('mkdir', ['-p', host_path]);
		}).then(function () {
			return (0, _utilities2.default)('lxc', ['file', 'pull', _this.name + '/' + dirname + '/' + archive, host_path]);
		})

		// Extract archive on host & rename it if needed
		.then(function () {
			return (0, _utilities2.default)('tar', ['xfz', archive], { cwd: host_path });
		}).then(function () {
			if (host_basename != container_basename) {
				// TODO name conflicts? Rename on container?
				return (0, _utilities2.default)('mv', [container_basename, host_basename], { cwd: host_path });
			}
		})

		// Remove archive on host & remove archive in container
		.then(function () {
			return (0, _utilities2.default)('rm', [archive], { cwd: host_path });
		}).then(function () {
			return _this.exec('rm ' + archive, options);
		});
	});
};

// TODO - support relative paths?
// Copy data from host to container with name
Container.prototype.upload = function (host_path, container_path) {
	var _this2 = this;

	// Check for relative paths
	return validate_paths(host_path, container_path).then(function () {
		// Setup names of directories and archive
		var host_basename = _path2.default.basename(host_path);
		var container_basename = host_basename;
		var archive = host_basename + '.tar.gz';

		// Get correct container path
		if (container_path.substring(container_path.length - 1) != '/') {
			container_basename = _path2.default.basename(container_path);
			container_path = _path2.default.dirname(container_path) + '/';
		}

		// Setup working dirs for host and container
		var host_options = { cwd: _path2.default.dirname(host_path) };
		var container_options = { cwd: container_path };

		return _bluebird2.default.all([_this2.host.path_exists(host_path), _this2.path_lacks(container_path + container_basename)])

		// Create archive on host
		.then(function () {
			return (0, _utilities2.default)('tar', ['cfz', archive, host_basename], host_options);
		})

		// Push file to container
		.then(function () {
			return (0, _utilities2.default)('lxc', ['file', 'push', archive, _this2.name + '/' + container_path], host_options);
		})

		// Extract archive in container and move it to desired path when required
		.then(function () {
			return _this2.exec('tar xfz ' + archive, container_options);
		}).then(function () {
			if (host_basename != container_basename) {
				return _this2.exec('mv ' + host_basename + ' ' + container_basename, container_options);
			}
		})

		// Remove archive from container and from host
		.then(function () {
			return _this2.exec('rm ' + archive, container_options);
		}).then(function () {
			return (0, _utilities2.default)('rm', [archive], host_options);
		});
	});
};

// Check if path exists in container
Container.prototype.path_exists = function (path) {
	return this.exec('stat ' + path).catch(function () {
		throw new Error('Path ' + path + ' in container does not exist');
	});
};

// Check if container path does not exist
Container.prototype.path_lacks = function (path) {
	var _this3 = this;

	return new _bluebird2.default(function (resolve, reject) {
		_this3.exec('stat ' + path).then(function () {
			return reject(new Error('Path ' + path + ' on container exists'));
		}).catch(function () {
			return resolve();
		});
	});
};

// Add mount
Container.prototype.add_disk = function (name, source, path) {
	var _this4 = this;

	return (0, _utilities2.default)('lxc', ['config', 'device', 'add', this.name, name, 'disk', 'source=' + source, 'path=' + path]).then(function () {
		return _this4;
	});
};

Container.prototype.remove_disk = function (name) {};

module.exports = Container;