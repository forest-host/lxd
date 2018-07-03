
import stream from 'stream';
import fs from 'fs';
import Promise from 'bluebird';
import request from 'request';
import WebSocket from 'ws';
import extend from 'extend';

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

// TODO - this is now the latter part of the container.exec funcion, move to container and keep this client stuff
/**
 * Process response from lxd API that requires listening to websockets
 * @param {Object} data - Data returned from LXD api containing ws locations etc.
 */
Client.prototype._process_websocket_response = function(data) {
	return new Promise((resolve) => {
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
		Object.keys(data.metadata.fds).map(key => {
			// Generate url from data
			var url = this.config.websocket + '/operations/' + data.id + '/websocket?secret=' + data.metadata.fds[key];

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
			// Push messages to output array
			sockets[stream].on('message', data => {
				// Clean string
				var string = data.toString('utf8').trim();
				if(string) {
					// Split output on newlines
					output[stream] = output[stream].concat(string.split('\n'));
				}
			});
		})

		// Control socket closes when done executing
		sockets.control.on('close', () => {
			sockets.stdin.close();
			sockets.stdout.close();
			sockets.stderr.close();

			resolve(output);
		});
	})

	// After getting output from sockets we need to get the statuscode from the operation
	.then(output => {
		return this._request('GET', '/operations/' + data.id)
			.then(operation => {
				// Set exit code
				output.status = operation.metadata.return;

				// Return exit code & stderr & stdout
				return output;
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
		console.log(body.error);
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
