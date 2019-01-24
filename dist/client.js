'use strict';

var _stream = require('stream');

var _stream2 = _interopRequireDefault(_stream);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _requestPromise = require('request-promise');

var _requestPromise2 = _interopRequireDefault(_requestPromise);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

var _pool = require('./pool');

var _pool2 = _interopRequireDefault(_pool);

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
 * Reduce volumes array to lxc device object
 */
function get_volumes_as_devices(volumes) {
	return volumes.reduce(function (aggregate, volume) {
		aggregate[volume.name] = {
			path: volume.path,
			source: volume.volume,
			pool: volume.pool,
			type: 'disk'
		};
		return aggregate;
	}, {});
}

/**
 * Get config that can be passed to lxd backend from env vars, mounts & volumes
 */
Client.prototype.get_container_config = function (variables, mounts, volumes) {
	return {
		config: get_variables_as_config(variables),
		devices: Object.assign(get_mounts_as_devices(mounts || []), get_volumes_as_devices(volumes || []))
	};
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

/**
 * Get config used for all API requests
 */
Client.prototype.get_request_config = function (method, path, body, qs) {
	return {
		url: this.config.url + path,
		agentOptions: {
			cert: this.config.cert,
			key: this.config.key,
			port: this.config.port,
			rejectUnauthorized: false
		},
		ecdhCurve: 'secp384r1',
		method: method,
		// Check if body is a stream, if not, everything will be json
		json: typeof body !== 'undefined' ? !(body instanceof _stream2.default.Readable) : true,
		// As we are always using json, send empty object when no body is set
		body: typeof body !== 'undefined' ? body : {},
		// Query string
		qs: typeof qs !== 'undefined' ? qs : {}
	};
};

/**
 * Get websocket that receives all lxd events
 */
Client.prototype.get_events_socket = function () {
	// Get events listener 
	return new _ws2.default(this.config.websocket + '/events?type=operation', {
		cert: this.config.cert,
		key: this.config.key,
		port: this.config.port,
		rejectUnauthorized: false,
		ecdhCurve: 'secp384r1'
	});
};

/**
 * Run asynchronous backend operation
 */
Client.prototype.run_async_operation = function (method, path, data, qs) {
	var _this = this;

	// Wait for socket to open before executing operation
	return new _bluebird2.default(function (resolve) {
		var socket = _this.get_events_socket();
		socket.on('open', function () {
			return resolve(socket);
		});
	})

	// Request an operation
	.then(function (socket) {
		return _this.request(method, path, data, qs)
		// Wait for operation event
		.then(function (body) {
			switch (body.metadata.class) {
				case 'task':
					return _this.process_task_operation(socket, body.metadata);
				case 'websocket':
					return _this.process_websocket_operation(body.metadata);
				case 'token':
					return body.metadata;
				default:
					throw new Error('API returned unknown operation class');
			}
		}).then(function (output) {
			// Terminate socket after succesful operation
			socket.terminate();
			return output;
		});
	});
};

/**
 * Run synchronous operation
 */
Client.prototype.run_sync_operation = function (method, path, data, qs) {
	return this.request(method, path, data, qs).then(function (body) {
		return body.metadata;
	});
};

/**
 * Make raw request to lxd api
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {Object} data - JSON data to send
 * @param {Object} qs - Query string params to send
 */
Client.prototype.raw_request = function (method, path, data, qs) {
	// Actually make the request
	return (0, _requestPromise2.default)(this.get_request_config(method, path, data, qs));
};

/**
 * Send request to LXD api and handle response appropriatly
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {Object} data - JSON data to send
 * @param {Object} qs - Query string params to send
 */
Client.prototype.request = function (method, path, data, qs) {
	return this.raw_request(method, path, data, qs)

	// Handle response
	.then(function (body) {
		// API response is not parsed on uploads
		if (typeof body === 'string') body = JSON.parse(body);

		if (body.type == 'error') throw new Error(body.error);

		return body;
	});
};

/**
 * Process task operation
 */
Client.prototype.process_task_operation = function (socket, operation) {
	return new _bluebird2.default(function (resolve, reject) {
		socket.on('message', function (message) {
			var data = JSON.parse(message).metadata;

			// Don't handle events for other operations
			if (data.id != operation.id) return;

			// Success
			if (data.status_code == 200) return resolve(data);

			// Failure
			if (data.status_code == 400 || data.status_code == 401) return reject(new Error(data.err));
		});
	});
};

/**
 * Process websocket operation of lxd api by connecting to sockets
 * @param {Object} metadata - Metadata returned from LXD api containing ws locations etc.
 */
Client.prototype.process_websocket_operation = function (metadata) {
	var _this2 = this;

	// Get us some helpfull names
	var socket_map = {
		0: 'stdin',
		1: 'stdout',
		2: 'stderr',
		control: 'control'
	};

	var sockets = {};

	// Collect output of sockets in arrays
	var output = {
		stdout: [],
		stderr: []
	};

	// We would like to listen to each socket
	Object.keys(metadata.metadata.fds).map(function (key) {
		// Generate url from metadata
		var url = _this2.config.websocket + '/operations/' + metadata.id + '/websocket?secret=' + metadata.metadata.fds[key];

		// Create socket listening to url
		sockets[socket_map[key]] = new _ws2.default(url, {
			cert: _this2.config.cert,
			key: _this2.config.key,
			port: _this2.config.port,
			rejectUnauthorized: false,
			ecdhCurve: 'secp384r1'
		});
	});

	// Keep track of stderr & stdout streams
	['stdout', 'stderr'].forEach(function (stream) {
		// Create arrays of lines of output
		sockets[stream].on('message', function (data) {
			var string = data.toString('utf8').trim();

			if (string) output[stream].push.apply(output[stream], string.split('\n'));
		});
	});

	return new _bluebird2.default(function (resolve) {
		// Control socket closes when done executing
		sockets.control.on('close', function () {
			sockets.stdin.close();
			sockets.stdout.close();
			sockets.stderr.close();

			// After getting output from sockets we need to get the statuscode from the operation
			_this2.run_sync_operation('GET', '/operations/' + metadata.id).then(function (operation) {
				// Set exit code
				output.status = operation.metadata.return;

				// Return exit code & stderr & stdout
				resolve(output);
			});
		});
	});
};

// Get container instance
Client.prototype.get_container = function (name) {
	return new _container2.default(this, name);
};

// Get json list of containers
Client.prototype.list = function () {
	return this.run_sync_operation('GET', '/containers');
};

// Get volume instance
Client.prototype.get_pool = function (name) {
	return new _pool2.default(this, name);
};

module.exports = Client;