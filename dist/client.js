'use strict';

var _stream = require('stream');

var _stream2 = _interopRequireDefault(_stream);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Represents a lxc client
 * @constructor
 * @param {Object} config - Configuration for connecting to lxd backend
 */
function Client(config) {
	// Config defaults
	var defaults = {
		api_version: '1.0'
	};

	// Overwrite defaults with config
	this.config = (0, _extend2.default)(defaults, config);

	this.load_certificates();

	// Set url
	this.config.url = 'https://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;
	this.config.websocket = 'wss://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;

	return this;
};

/**
 * Make sure we got a file buffer for cert & key
 */
Client.prototype.load_certificates = function () {
	if (typeof this.config.cert == 'string') {
		this.config.cert = _fs2.default.readFileSync(this.config.cert);
	}
	if (typeof this.config.key == 'string') {
		this.config.key = _fs2.default.readFileSync(this.config.key);
	}
};

// TODO - this is now the latter part of the container.exec funcion, move to container and keep this client stuff
/**
 * Process response from lxd API that requires listening to websockets
 * @param {Object} data - Data returned from LXD api containing ws locations etc.
 */
Client.prototype._process_websocket_response = function (data) {
	var _this = this;

	return new _bluebird2.default(function (resolve) {
		// Get us some helpfull names
		var socket_map = {
			'0': 'stdin',
			'1': 'stdout',
			'2': 'stderr',
			'control': 'control'
		};

		var sockets = {};

		// Collect output of sockets in arrays
		var output = {
			stdout: [],
			stderr: []
		};

		// We would like to listen to each socket
		Object.keys(data.metadata.fds).map(function (key) {
			// Generate url from data
			var url = _this.config.websocket + '/operations/' + data.id + '/websocket?secret=' + data.metadata.fds[key];

			// Create socket listening to url
			sockets[socket_map[key]] = new _ws2.default(url, {
				cert: _this.config.cert,
				key: _this.config.key,
				port: _this.config.port,
				rejectUnauthorized: false
			});
		});

		// Keep track of stderr & stdout streams
		['stdout', 'stderr'].forEach(function (stream) {
			// Push messages to output array
			sockets[stream].on('message', function (data) {
				// Clean string
				var string = data.toString('utf8').trim();
				if (string) {
					// Split output on newlines
					output[stream] = output[stream].concat(string.split('\n'));
				}
			});
		});

		// Control socket closes when done executing
		sockets.control.on('close', function () {
			sockets.stdin.close();
			sockets.stdout.close();
			sockets.stderr.close();

			resolve(output);
		});
	})

	// After getting output from sockets we need to get the statuscode from the operation
	.then(function (output) {
		return _this._request('GET', '/operations/' + data.id).then(function (operation) {
			if (operation.metadata.return !== 0) {
				// When return code reflects errors, send stderr
				throw new Error(output.stderr);
			} else {
				// Otherwise all should be well and we can return stdout
				return output.stdout;
			}
		});
	});
};

/**
 * Send request to LXD api and handle response appropriatly
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {string} data - JSON data to send
 */
Client.prototype._request = function (method, path, data) {
	var _this2 = this;

	return this._make_request(method, path, data).then(function (body) {
		return _this2._process_response(body);
	});
};

/**
 * Create request for LXD API
 * @param {string} method - GET / PUT / POST etc.
 * @param {string} path - Url path for request (/containers etc.)
 * @param {object} data - Data to send, mostly json, file stream otherwise
 */
Client.prototype._make_request = function (method, path, data) {
	var _this3 = this;

	return new _bluebird2.default(function (resolve, reject) {
		var config = {
			url: _this3.config.url + path,
			agentOptions: {
				cert: _this3.config.cert,
				key: _this3.config.key,
				port: _this3.config.port,
				rejectUnauthorized: false
			},
			method: method,
			// Check if data is a stream, if not, everything will be json
			json: typeof data !== 'undefined' ? !(data instanceof _stream2.default.Readable) : true,
			// As we are always using json, send empty object when no data is set
			body: typeof data !== 'undefined' ? data : {}
		};

		var req = (0, _request2.default)(config, function (err, res, body) {
			if (err) {
				reject(err);
			} else {
				resolve(body);
			}
		});
	});
};

/**
 * Process response from LXD api
 * @param {Object} body - JSON returned from LXD API.
 */
Client.prototype._process_response = function (body) {
	// API response is not parsed on uploads
	if (typeof body === 'string') {
		body = JSON.parse(body);
	}

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

/**
 * Process async response from LXD api
 * @param {Object} body - JSON returned from LXD API.
 */
Client.prototype._process_async_response = function (body) {
	switch (body.metadata.class) {
		case 'task':
			return this._request('GET', '/operations/' + body.metadata.id + '/wait');
		case 'websocket':
			return this._process_websocket_response(body.metadata);
		case 'token':
			return body.metadata;
		default:
			throw new Error('API returned unknown operation class');
	}
};

// Create and start a new container from image with name
Client.prototype.launch = function (image, name, config) {
	// Create container
	return this.create(image, name, config)
	// Start container
	.then(function (container) {
		return container.start();
	});
};

// Get container instance
Client.prototype.get_container = function (name) {
	// Check for existence of container
	return new _container2.default(this, name);
};

// Get json list of containers
Client.prototype.list = function () {
	return this._request('GET', '/containers');
};

module.exports = Client;