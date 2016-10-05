'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.copy_from = exports.copy_to = exports.execute = exports.list = exports.destroy = exports.create = undefined;

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _utilities = require('utilities');

var _utilities2 = _interopRequireDefault(_utilities);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Create a new container from image with name
var create = function (image, container_name) {
	return (0, _utilities2.default)('lxc', ['launch', image, container_name]);
};

// Destroy container with name
var destroy = function (container_name) {
	return (0, _utilities2.default)('lxc', ['delete', container_name, '--force']);
};

// Get json list of containers
var list = function () {
	return (0, _utilities2.default)('lxc', ['list', '--format=json']).then(function (output) {
		return output.stdout.map(function (line) {
			return JSON.parse(line.toString());
		});
	}).then(function (lines) {
		return lines[0];
	});
};

// Check if paths are not relative
var validate_paths = function (host_path, container_path) {
	if (host_path.substring(0, 1) == '.' || container_path.substring(0, 1) == '.') {
		return _bluebird2.default.reject(new Error('This function does not support relative paths'));
	} else {
		return _bluebird2.default.resolve();
	}
};

// TODO - support relative paths?
// Copy data from host to container with name
var copy_to = function (container_name, host_path, container_path) {
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

		return _bluebird2.default.all([host_path_exists(host_path), container_path_not_exists(container_name, container_path + container_basename)])

		// Create archive on host
		.then(function () {
			return (0, _utilities2.default)('tar', ['cfz', archive, host_basename], host_options);
		})

		// Push file to container
		.then(function () {
			return (0, _utilities2.default)('lxc', ['file', 'push', archive, container_name + '/' + container_path], host_options);
		})

		// Extract archive in container and move it to desired path when required
		.then(function () {
			return execute(container_name, 'tar xfz ' + archive, container_options);
		}).then(function () {
			if (host_basename != container_basename) {
				return execute(container_name, 'mv ' + host_basename + ' ' + container_basename, container_options);
			}
		})

		// Remove archive from container and from host
		.then(function () {
			return execute(container_name, 'rm ' + archive, container_options);
		}).then(function () {
			return (0, _utilities2.default)('rm', [archive], host_options);
		});
	});
};

// Check if path exists in container
var container_path_exists = function (container_name, path) {
	return execute(container_name, 'stat ' + path).catch(function () {
		throw new Error('Path ' + path + ' in container does not exist');
	});
};

// Check if path exists on host
var host_path_exists = function (path) {
	return (0, _utilities2.default)('stat', [path]).catch(function () {
		throw new Error('Path ' + path + ' on host does not exist');
	});
};

// Check if container path does not exist
var container_path_not_exists = function (container_name, path) {
	return new _bluebird2.default(function (resolve, reject) {
		execute(container_name, 'stat ' + path).then(function () {
			return reject(new Error('Path ' + path + ' on container exists'));
		}).catch(function () {
			return resolve();
		});
	});
};

// Check if host path does not exist
var host_path_not_exists = function (path) {
	return new _bluebird2.default(function (resolve, reject) {
		(0, _utilities2.default)('stat', [path]).then(function () {
			return reject(new Error('Path ' + path + ' on host exists'));
		}).catch(function () {
			return resolve();
		});
	});
};

// Copy data from container to host
var copy_from = function (container_name, container_path, host_path) {
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
		return _bluebird2.default.all([host_path_not_exists(host_path + host_basename), container_path_exists(container_name, dirname + '/' + container_basename)])

		// Create archive in container
		.then(function () {
			return execute(container_name, 'tar cfz ' + archive + ' ' + container_basename, options);
		})

		// Make sure target exists & copy archive to host
		.then(function () {
			return (0, _utilities2.default)('mkdir', ['-p', host_path]);
		}).then(function () {
			return (0, _utilities2.default)('lxc', ['file', 'pull', container_name + '/' + dirname + '/' + archive, host_path]);
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
			return execute(container_name, 'rm ' + archive, options);
		});
	});
};

// Execute command in container
var execute = function (container_name, command, options) {
	var cmd = '';

	// Catch empty options
	options = options || {};

	// Change to working dir
	if ('cwd' in options) {
		cmd += 'cd ' + options.cwd + '; ';
	}

	// Execute command as user
	if ('user' in options) {
		cmd += 'sudo -u ' + options.user + ' ';
	}

	// Escape string
	cmd += command;

	// Run all of it in designated container
	return (0, _utilities2.default)('lxc', ['exec', container_name, '--', '/bin/bash', '-c', cmd]);
};

exports.create = create;
exports.destroy = destroy;
exports.list = list;
exports.execute = execute;
exports.copy_to = copy_to;
exports.copy_from = copy_from;
exports.default = {
	create: create,
	destroy: destroy,
	list: list,
	execute: execute,
	copy_to: copy_to,
	copy_from: copy_from
};