'use strict';

var _url = require('url');

var parser = _interopRequireWildcard(_url);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _utilities = require('utilities');

var _utilities2 = _interopRequireDefault(_utilities);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var Client = function () {};

// Config vars
Client.prototype._api_version = '1.0';
Client.prototype._path = 'http://unix:/var/lib/lxd/unix.socket:/';
Client.prototype._websocket = 'ws+unix:///var/lib/lxd/unix.socket';

// Handle operation response
Client.prototype._process_async_response = function (body) {
	switch (body.metadata.class) {
		case 'task':
			return this._request('GET', '/operations/' + body.metadata.id + '/wait');
		case 'websocket':
			return this._create_sockets(body.metadata);
		case 'token':
			return body.metadata;
		default:
			throw new Error('API returned unknown operation class');
	}
};

// Handle API response
Client.prototype._process_response = function (body) {
	switch (body.type) {
		// We have to wait for this operation
		case 'async':
			return this._process_async_response(body);
		// What's done is done
		case 'sync':
			return body.metadata;
		// Not good
		case 'error':
			throw new Error(body.error);
		// We can't handle this
		default:
			throw new Error('API returned unknown body type');
	}
};

// TODO - this is now the latter part of the container.exec funcion, move to container and keep this client stuff
Client.prototype._create_sockets = function (data) {
	var _this = this;

	return new _bluebird2.default(function (resolve) {
		// Helpful names
		var socket_map = {
			'0': 'stdin',
			'1': 'stdout',
			'2': 'stderr',
			'control': 'control'
		};

		var sockets = {};

		// Output for promise return
		var output = {
			stdout: [],
			stderr: []
		};

		Object.keys(data.metadata.fds).map(function (key) {
			// Parse url ourselves to get around weirdness in ws lib
			var url = parser.parse(_this._websocket);
			url.path = '/' + _this._api_version + '/operations/' + data.id + '/websocket?secret=' + data.metadata.fds[key];

			sockets[socket_map[key]] = new _ws2.default(url);
		});

		// Push messages to output array
		sockets.stdout.on('message', function (data) {
			var string = data.toString('utf8').trim();
			if (string) {
				output.stdout.push(string);
			}
		});
		sockets.stderr.on('message', function (data) {
			var string = data.toString('utf8').trim();
			if (string) {
				output.stderr.push(string);
			}
		});

		// Control socket closes when done
		sockets.control.on('close', function () {
			sockets.stdin.close();
			sockets.stdout.close();
			sockets.stderr.close();
			resolve(output);
		});
	}).then(function (output) {
		// After getting output from sockets we need to get the statuscode from the operation
		return _this._request('GET', '/operations/' + data.id).then(function (test) {
			if (test.metadata.return !== 0) {
				throw new Error('Process exited with error code ' + test.metadata.return);
			} else {
				return output;
			}
		});
	});
};

// Make a request to the LXD API
Client.prototype._request = function (method, url, data) {
	var _this2 = this;

	return new _bluebird2.default(function (resolve, reject) {
		(0, _request2.default)({
			url: _this2._path + _this2._api_version + url,
			headers: { 'Host': '' },
			method: method,
			json: true,
			body: typeof data !== 'undefined' ? data : {}
		}, function (err, res, body) {
			if (err) {
				reject(err);
			} else {
				resolve(body);
			}
		});
	}).then(function (body) {
		return _this2._process_response(body);
	});
};

// Create container
Client.prototype.create = function (image, name, config) {
	var _this3 = this;

	// Create container
	return this._request('POST', '/containers', {
		name: name,
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
		return new _container2.default(_this3, name);
	});
};

// Create and start a new container from image with name
Client.prototype.launch = function (image, name, config) {
	// Create container
	return this.create(image, name, config)
	// Start container
	.then(function (container) {
		return container.start().then(function () {
			return container;
		});
	});
};

// Get container instance
Client.prototype.get = function (name) {
	var _this4 = this;

	// Check for existence of container
	return this.list(name).then(function (list) {
		// Get container with this name from list
		return list.filter(function (container) {
			container == '/1.0/containers/' + name;
		});
	}).then(function (found) {
		if (found) {
			// Return new container instance when it exists
			return new _container2.default(_this4, name);
		} else {
			// Not existing
			throw new Error('Container not found');
		}
	});
};

// Get json list of containers
Client.prototype.list = function () {
	return this._request('GET', '/containers');
	/*
 var args = typeof(container) !== 'undefined' ? ['list', container, '--format=json'] : ['list', '--format=json'];
 	return exec('lxc', args)
 	.then(output => output.stdout.map(line => JSON.parse(line.toString())))
 	.then(lines => lines[0])
 	.then(output => {
 		if(typeof(container) !== 'undefined' && ! output.length) {
 			throw new Error('Container not found');
 		}
 		return output;
 	});
 	*/
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