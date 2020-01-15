
import stream from 'stream';
import fs from 'fs';
import request from 'request-promise-native';
import WebSocket from 'ws';
import extend from '@forest.host/extend';

import Container from './container';
import Pool from './pool';

/**
 * Represents a lxd client
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

	// Load certs if string was passed
	if(typeof(this.config.cert) == 'string') {
		this.config.cert = fs.readFileSync(this.config.cert);
	}
	if(typeof(this.config.key) == 'string') {
		this.config.key = fs.readFileSync(this.config.key);
	}

	this.config.websocket = 'wss://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;

	return this;
};

/**
 * Reduce variables to lxd config object
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
 * Reduce mounts array to lxd devices object
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
 * Reduce volumes array to lxd device object
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
 * Get websocket that receives all lxd events
 */
Client.prototype.get_events_socket = function() {
	// Get events listener 
	return new WebSocket(this.config.websocket + '/events?type=operation', {
		cert: this.config.cert,
		key: this.config.key,
		port: this.config.port,
		rejectUnauthorized: false,
		// TODO - this was added because stuff was broken without it, 
		// TODO node is complaining this does not adhere to the RFC 6066
		ecdhCurve: 'secp384r1',
	});
}

/**
 * Run asynchronous backend operation
 */
Client.prototype.run_async_operation = function(config) {
	// Wait for socket to open before executing operation
	return new Promise((resolve, reject) => {
		let socket = this.get_events_socket();
    // If socket does not open, don't stay here waiting, give it some seconds
    let timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Unable to open events socket'));
    }, 3000);

		socket.on('open', () => {
      clearTimeout(timeout);
      resolve(socket)
    });
	})

	// Request an operation
	.then(socket => {
		return this.run_operation(config)
			// Wait for operation event
			.then(operation => {
				switch (operation.class) {
					case 'task':
						return this.process_task_operation(operation, socket);
					case 'websocket':
						return this.process_websocket_operation(operation, config);
					case 'token':
						return operation;
					default: 
						throw new Error('API returned unknown operation class');
				}
			})
			.then(output => {
				// Terminate socket after succesful operation
				//socket.terminate();
        socket.close();
				return output;
			})
			.catch(err => {
				// Just in case something fails, destroy socket
				//socket.terminate();
        socket.close();
				throw err;
			})
	})
};

/**
 * Run synchronous operation
 */
Client.prototype.run_operation = function(config) {
	// Raw request
	return this.raw_request(config)
		// Handle response
		.then(body => {
			if(body.type == 'error')
				throw new Error(body.error);
			
			return body.metadata;
		})
}

/**
 * Make raw request to lxd api
 * @param {string} method - HTTP method to use (GET, POST etc.).
 * @param {string} path - Path to request
 * @param {Object} data - JSON data to send
 * @param {Object} qs - Query string params to send
 */
Client.prototype.raw_request = function(config) {
	let defaults = {
		agentOptions: {
			cert: this.config.cert,
			key: this.config.key,
			port: this.config.port,
			rejectUnauthorized: false,
		},
		ecdhCurve: 'secp384r1',
		json: true,
		method: 'GET'
	};

	let data = extend(defaults, config);

	// Set url
	let base_url = 'https://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;

	// Append base url to path
	data.url = base_url + data.url;

	// Actually make the request
	return request(data);
};

/**
 * Process task operation
 */
Client.prototype.process_task_operation = function(operation, socket) {
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
 * Wait for websocket operation to complete, saving output
 */
function finalize_websocket_operation(sockets, operation, config) {
	var result = {
		output: [],
	};

	// Create arrays of lines of output
	sockets['0'].on('message', data => {
		var string = data.toString('utf8').trim();

		// Push strings onto output array, seperated by newline, use apply so we can pass split string as arguments to push
		if(string)
			result.output.push.apply(result.output, string.split('\n'));
	});

	return new Promise((resolve, reject) => {
		// We do not want to run commands longer than 10 minutes, send kill signal after that
		if(config.timeout) {
			var timeout = setTimeout(() => {
				sockets.control.send(JSON.stringify({
					command: "signal",
					signal: 15
				}));
			}, config.timeout);
		}

		Object.keys(sockets).forEach(socket => {
			sockets[socket].on('error', () => {
				reject(new Error('Socket returned error'));
			});
		});

		// Control socket closes when done executing
		sockets.control.on('close', () => {
			// Clear timeout as we can not send control signals through closed socket
			if(config.timeout)
				clearTimeout(timeout);

			// When control closes, we can safely close the stdin/stdout socket
			sockets[0].close();

			// After getting output from sockets we need to get the statuscode from the operation
			this.run_operation({ method: 'GET', url: '/operations/' + operation.id })
				// Use function here to have own scope
				.then(function(operation) {
					// Set exit code
					result.status = operation.metadata.return;

					// Return exit code & stderr & stdout
					resolve(result);
				});
		});
	});
}

/**
 * Process websocket operation of lxd api by connecting to sockets
 * @param {Object} operation - Operation returned from LXD api containing ws locations etc.
 */
Client.prototype.process_websocket_operation = function(operation, config) {
	var sockets = {};

	// We would like to listen to each socket
	Object.keys(operation.metadata.fds).map(key => {
		// Generate url from metadata
		var url = this.config.websocket + '/operations/' + operation.id + '/websocket?secret=' + operation.metadata.fds[key];

		// Create socket listening to url
		sockets[key] = new WebSocket(url, {
			cert: this.config.cert,
			key: this.config.key,
			port: this.config.port,
			rejectUnauthorized: false,
			ecdhCurve: 'secp384r1',
		});
	});

	if(config.interactive)
		return Promise.resolve(sockets);

	return finalize_websocket_operation.apply(this, [sockets, operation, config]);
};


// Get container instance
Client.prototype.get_container = function(name) {
	return new Container(this, name);
};

// Get json list of containers
Client.prototype.list = function() {
	return this.run_operation({ method: 'GET', url: '/containers'});
};

// Get volume instance
Client.prototype.get_pool = function(name) {
	return new Pool(this, name);
};

module.exports = Client;
