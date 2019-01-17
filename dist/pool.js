'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Pool(client, name) {
	this.client = client;
	this.name = name;
	this.url = '/storage-pools/' + this.name + '/volumes';
}

/**
 * List storage volumes in this pool
 */
Pool.prototype.list = function () {
	var _this = this;

	return this.client.run_sync_operation('GET', this.url).then(function (list) {
		return list
		// Only get custom volumes
		.filter(function (uri) {
			return uri.indexOf(_this.url + '/custom') != -1;
		})
		// Only get volume names
		.map(function (uri) {
			return _path2.default.basename(uri);
		});
	});
};

/**
 * Create a volume in this storage pool, possibly on cluster target
 */
Pool.prototype.create_volume = function (name, target) {
	// Build query string
	var qs = {};
	if (typeof target !== 'undefined') {
		qs.target = target;
	};

	// Volume config
	var config = {
		config: {},
		name,
		type: 'custom'
	};

	return this.client.run_sync_operation('POST', this.url, config, qs);
};

Pool.prototype.destroy_volume = function (name) {
	return this.client.run_sync_operation('DELETE', this.url + '/custom/' + name);
};

exports.default = Pool;