
import stream from 'stream';
import fs from 'fs';
import Promise from 'bluebird';
import request from 'request-promise';
import WebSocket from 'ws';
import extend from 'extend';

import Container from './container';
import Pool from './pool';

/**
 * Represents a lxc client
 * @constructor
 * @param {Object} config - Configuration for connecting to lxd backend
 */
function Client(config) {
	// Config defaults
	var defaults = {
		api_version: '1.0',
	};

	// Overwrite defaults with config
	this.config = extend(defaults, config);

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
	if(typeof(variables) == 'undefined') {
		return undefined;
	}

	return Object.keys(variables).reduce((aggregate, name) => {
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
	return mounts.reduce((aggregate, mount) => {
		aggregate[mount.name] = {
			source: mount.source,
			path: mount.path,
			type: 'disk',
		};
		return aggregate;
	}, {});
}

/**
 * Reduce volumes array to lxc device object
 */
function get_volumes_as_devices(volumes) {
	return volumes.reduce((aggregate, volume) => {
		aggregate[volume.name] = {
			path: volume.path,
			source: volume.volume,
			pool: volume.pool,
			type: 'disk',
		};
		return aggregate;
	}, {});
}

/**
 * Get config that can be passed to lxd backend from env vars, mounts & volumes
 */
Client.prototype.get_container_config = function(variables, mounts, volumes) {
	return {
		config: get_variables_as_config(variables),
		devices: Object.assign(get_mounts_as_devices(mounts || []), get_volumes_as_devices(volumes || [])),
	};
}

/**
 * Make sure we got a file buffer for cert & key
 */
Client.prototype.load_certificates = function() {
	if(typeof(this.config.cert) == 'string') {
		this.config.cert = fs.readFileSync(this.config.cert);
	}
	if(typeof(this.config.key) == 'string') {
		this.config.key = fs.readFileSync(this.config.key);
	}
}

/**
 * Get config used for all API requests
 */
Client.prototype.get_request_config = function(method, path, body, qs) {
	return {
		url: this.config.url + path,
		agentOptions: {
			cert: this.config.cert,
			key: this.config.key,
			port: this.config.port,
			rejectUnauthorized: false,
		},
		ecdhCurve: 'secp384r1',
		method: method,
		// Check if body is a stream, if not, everything will be json
		json: (typeof(body) !== 'undefined' ? ! (body instanceof stream.Readable) : true),
		// As we are always using json, send empty object when no body is set
		body: typeof(body) !== 'undefined' ? body : {},
		// Query string
		qs: typeof(qs) !== 'undefined' ? qs : {},
	};
}

/**
 * Get websocket that receives all lxd events
 */
Client.prototype.get_events_socket = function() {
	// Get events listener 
	return new WebSocket(this.config.websocket + '/events?type=operation', {
		cert: this.config.cert,
		key: this.config.key,
		port: this.config.port,
		rejectUnauthorized: false,
		ecdhCurve: 'secp384r1',
	});
}

/**
 * Run asynchronous backend operation
 */
Client.prototype.run_async_operation = function(method, path, data, qs) {
	// Wait for socket to open before executing operation
	return new Promise(resolve => {
		var socket = this.get_events_socket();
		socket.on('open', () => resolve(socket));
	})

	// Request an operation
	.then(socket => {
		return this.request(method, path, data, qs)
			// Wait for operation event
			.then(body => {
				switch (body.metadata.class) {
					case 'task':
						return this.process_task_operation(socket, body.metadata);
					case 'websocket':
						return this.process_websocket_operation(body.metadata);
					case 'token':
						return body.metadata;
					default: 
						throw new Error('API returned unknown operation class');
				}
			})
			.then(output => {
				// Terminate socket after succesful operation
				socket.terminate();
				return output;
			});
	})
};

/**
 * Run synchronous operation
 */
Client.prototype.run_sync_operation = function(method, path, data, qs) {
	return this.request(method, path, data, qs)
		.then(body => body.metadata);
}

/**
 * Make raw request to lxd api
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {Object} data - JSON data to send
 * @param {Object} qs - Query string params to send
 */
Client.prototype.raw_request = function(method, path, data, qs) {
	// Actually make the request
	return request(this.get_request_config(method, path, data, qs));
};

/**
 * Send request to LXD api and handle response appropriatly
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {Object} data - JSON data to send
 * @param {Object} qs - Query string params to send
 */
Client.prototype.request = function(method, path, data, qs) {
	return this.raw_request(method, path, data, qs)

	// Handle response
	.then(body => {
		// API response is not parsed on uploads
		if(typeof(body) === 'string')
			body = JSON.parse(body);

		if(body.type == 'error')
			throw new Error(body.error);
		
		return body;
	});
};

/**
 * Process task operation
 */
Client.prototype.process_task_operation = function(socket, operation) {
	return new Promise((resolve, reject) => {
		socket.on('message', message => {
			var data = JSON.parse(message).metadata;
			
			// Don't handle events for other operations
			if(data.id != operation.id)
				return;

			// Success
			if(data.status_code == 200)
				return resolve(data);

			// Failure
			if(data.status_code == 400 || data.status_code == 401)
				return reject(new Error(data.err));
		});
	});
}

/**
 * Process websocket operation of lxd api by connecting to sockets
 * @param {Object} metadata - Metadata returned from LXD api containing ws locations etc.
 */
Client.prototype.process_websocket_operation = function(metadata) {
	// Get us some helpfull names
	var socket_map = {
		0: 'stdin',
		1: 'stdout',
		2: 'stderr',
		control: 'control',
	};

	var sockets = {};

	// Collect output of sockets in arrays
	var output = {
		stdout: [],
		stderr: [],
	};

	// We would like to listen to each socket
	Object.keys(metadata.metadata.fds).map(key => {
		// Generate url from metadata
		var url = this.config.websocket + '/operations/' + metadata.id + '/websocket?secret=' + metadata.metadata.fds[key];

		// Create socket listening to url
		sockets[socket_map[key]] = new WebSocket(url, {
			cert: this.config.cert,
			key: this.config.key,
			port: this.config.port,
			rejectUnauthorized: false,
			ecdhCurve: 'secp384r1',
		});
	});

	// Keep track of stderr & stdout streams
	['stdout', 'stderr'].forEach(stream => {
		// Create arrays of lines of output
		sockets[stream].on('message', data => {
			var string = data.toString('utf8').trim();

			if(string)
				output[stream].push.apply(output[stream], string.split('\n'));
		});
	})

	return new Promise((resolve) => {
		// Control socket closes when done executing
		sockets.control.on('close', () => {
			sockets.stdin.close();
			sockets.stdout.close();
			sockets.stderr.close();

			// After getting output from sockets we need to get the statuscode from the operation
			this.run_sync_operation('GET', '/operations/' + metadata.id)
				.then(operation => {
					// Set exit code
					output.status = operation.metadata.return;

					// Return exit code & stderr & stdout
					resolve(output);
				});
		});
	});
};


// Get container instance
Client.prototype.get_container = function(name) {
	return new Container(this, name);
};

// Get json list of containers
Client.prototype.list = function() {
	return this.run_sync_operation('GET', '/containers');
};

// Get volume instance
Client.prototype.get_pool = function(name) {
	return new Pool(this, name);
};

module.exports = Client;
