'use strict';

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _utilities = require('utilities');

var _utilities2 = _interopRequireDefault(_utilities);

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Client = function () {};

// Create and start a new container from image with name
Client.prototype.launch = function (image, name) {
	var _this = this;

	return (0, _utilities2.default)('lxc', ['launch', image, name]).then(function () {
		return new _container2.default(_this, name);
	});
};

// Get container instance
Client.prototype.get = function (name) {
	var _this2 = this;

	// Check for existence of container
	return this.list(name).then(function () {
		// Return new container instance when it exists
		return new _container2.default(_this2, name);
	});
};

// Destroy container with name
Client.prototype.destroy = function (name) {
	return (0, _utilities2.default)('lxc', ['delete', name, '--force']);
};

// Get json list of containers
Client.prototype.list = function (container) {
	var args = typeof container !== 'undefined' ? ['list', container, '--format=json'] : ['list', '--format=json'];

	return (0, _utilities2.default)('lxc', args).then(function (output) {
		return output.stdout.map(function (line) {
			return JSON.parse(line.toString());
		});
	}).then(function (lines) {
		return lines[0];
	}).then(function (output) {
		if (typeof container !== 'undefined' && !output.length) {
			throw new Error('Container not found');
		}
		return output;
	});
};

// Check if path exists on host
Client.prototype.path_exists = function (path) {
	return (0, _utilities2.default)('stat', [path]).catch(function () {
		throw new Error('Path ' + path + ' on host does not exist');
	});
};

// Check if host path does not exist
Client.prototype.path_lacks = function (path) {
	return new _bluebird2.default(function (resolve, reject) {
		(0, _utilities2.default)('stat', [path]).then(function () {
			return reject(new Error('Path ' + path + ' on host exists'));
		}).catch(function () {
			return resolve();
		});
	});
};

module.exports = new Client();