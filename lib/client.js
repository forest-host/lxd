
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
Client.prototype.get_request_config = function(method, path, data) {
	return {
		url: this.config.url + path,
		agentOptions: {
			cert: this.config.cert,
			key: this.config.key,
			port: this.config.port,
			rejectUnauthorized: false,
		},
		method: method,
		// Check if data is a stream, if not, everything will be json
		json: (typeof(data) !== 'undefined' ? ! (data instanceof stream.Readable) : true),
		// As we are always using json, send empty object when no data is set
		body: typeof(data) !== 'undefined' ? data : {},
	};
}

/**
 * Get websocket that receives all lxd events
 */
Client.prototype.get_events_socket = function() {
	var url = this.config.websocket + '/events?type=operation';

	var socket = new WebSocket(url, {
		cert: this.config.cert,
		key: this.config.key,
		port: this.config.port,
		rejectUnauthorized: false,
	});

	return socket;
}

/**
 * Run asynchronous backend operation
 */
Client.prototype.run_async_operation = function(method, path, data) {
	// Get events listener before executing operation
	var events = this.get_events_socket();

	// Request an operation
	return this.request(method, path, data)

	// Wait for operation event
	.then(body => {
		switch (body.metadata.class) {
			case 'task':
				return this.process_task_operation(events, body.metadata);
			case 'websocket':
				return this.process_websocket_operation(body.metadata);
			case 'token':
				return body.metadata;
			default: 
				throw new Error('API returned unknown operation class');
		}
	})
	.then(output => {
		events.close();
		return output;
	})
};

/**
 * Run synchronous operation
 */
Client.prototype.run_sync_operation = function(method, path, data) {
	return this.request(method, path, data)
		.then(body => body.metadata);
}

/**
 * Send request to LXD api and handle response appropriatly
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {string} data - JSON data to send
 */
Client.prototype.request = function(method, path, data) {
	// Actually make the request
	return request(this.get_request_config(method, path, data))

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
Client.prototype.process_task_operation = function(events, metadata) {
	return new Promise((resolve, reject) => {
		events.on('message', data => {
			data = JSON.parse(data).metadata;
			
			// Don't handle events for other operations
			if(data.id != metadata.id)
				return;

			// Success
			if(data.status_code == 200)
				resolve(data);

			// Failure
			if(data.status_code == 400 || data.status_code == 401)
				reject(new Error(data.err));
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
		'0': 'stdin',
		'1': 'stdout',
		'2': 'stderr',
		'control': 'control',
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
		});
	});

	// Keep track of stderr & stdout streams
	['stdout', 'stderr'].forEach(stream => {
		// Create arrays of lines of output
		sockets[stream].on('message', data => {
			var string = data.toString('utf8').trim();

			if(string) {
				output[stream] = output[stream].concat(string.split('\n'));
			}
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
