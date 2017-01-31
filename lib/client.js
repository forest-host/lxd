
import stream from 'stream';
import * as parser from 'url';
import Promise from 'bluebird';
import request from 'request';
import WebSocket from 'ws';
import {_extend as extend} from 'util';

import Container from './container';

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

	// Set url
	this.config.url = 'https://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;
	this.config.websocket = 'wss://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;

	return this;
};

// TODO - this is now the latter part of the container.exec funcion, move to container and keep this client stuff
Client.prototype._process_websocket_response = function(data) {
	return new Promise((resolve) => {
		// Helpful names
		var socket_map = {
			'0': 'stdin',
			'1': 'stdout',
			'2': 'stderr',
			'control': 'control',
		};

		var sockets = {};

		// Output for promise return
		var output = {
			stdout: [],
			stderr: [],
		};

		Object.keys(data.metadata.fds).map(key => {
			var url = this.config.websocket + '/operations/' + data.id + '/websocket?secret=' + data.metadata.fds[key];

			sockets[socket_map[key]] = new WebSocket(url, {
				cert: this.config.cert,
				key: this.config.key,
				port: this.config.port,
				rejectUnauthorized: false,
			});
		});

		// Push messages to output array
		sockets.stdout.on('message', data => {
			var string = data.toString('utf8').trim();
			if(string) {
				output.stdout = output.stdout.concat(string.split('\n'));
			}
		});
		sockets.stderr.on('message', data => {
			var string = data.toString('utf8').trim();
			if(string) {
				output.stderr = output.stderr.concat(string.split('\n'));
			}
		});

		// Control socket closes when done
		sockets.control.on('close', () => {
			sockets.stdin.close();
			sockets.stdout.close();
			sockets.stderr.close();

			resolve(output);
		});
	})

	.then(output => {
		// After getting output from sockets we need to get the statuscode from the operation
		return this._request('GET', '/operations/' + data.id)
			.then(operation => {
				if(operation.metadata.return !== 0) {
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
Client.prototype._request = function(method, path, data) {
	return this._make_request(method, path, data)
		.then(body => this._process_response(body));
};

/**
 * Create request for LXD API
 * @param {string} method - GET / PUT / POST etc.
 * @param {string} path - Url path for request (/containers etc.)
 * @param {object} data - Data to send, mostly json, file stream otherwise
 */
Client.prototype._make_request = function(method, path, data) {
	return new Promise((resolve, reject) => {
		var config = {
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

		var req = request(config, (err, res, body) => {
			if(err) {
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
Client.prototype._process_response = function(body) {
	// API response is not parsed on uploads
	if(typeof(body) === 'string') {
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
Client.prototype._process_async_response = function(body) {
	switch (body.metadata.class) {
	case 'task':
		return this._request('GET', '/operations/'+body.metadata.id+'/wait');
	case 'websocket':
		return this._process_websocket_response(body.metadata);
	case 'token':
		return body.metadata;
	default: 
		throw new Error('API returned unknown operation class');
	}
};

// Create container
Client.prototype.create = function(image, name, config) {
	// Create container
	return this._request('POST', '/containers', {
		name: name,
		architecture: 'x86_64',
		profiles: ['default'],
		ephemeral: false,
		config: typeof(config) !== 'undefined' ? config : {},
		source: {
			type: 'image',
			alias: image,
		}
	})

	// Return container instance
	.then(() => this.get_container(name));
};

// Create and start a new container from image with name
Client.prototype.launch = function(image, name, config) {
	// Create container
	return this.create(image, name, config)
		// Start container
		.then(container => container.start());
};

// Get container instance
Client.prototype.get_container = function(name) {
	// Check for existence of container
	return new Container(this, name);
};

// Get json list of containers
Client.prototype.list = function() {
	return this._request('GET', '/containers');
};

module.exports = Client;
