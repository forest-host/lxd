
import * as parser from 'url';
import Promise from 'bluebird';
import exec from 'utilities';
import request from 'request';
import WebSocket from 'ws';
import {_extend as extend} from 'util';

import Container from './container';

function Client(config) {
	// Config defaults
	var defaults = {
		api_version: '1.0',
	};

	// Overwrite defaults with config
	this.config = extend(defaults, config);

	// Set url
	this.config.url = 'https://' + this.config.host + ':' + this.config.port + '/' + this.config.api_version;

	this.config.websocket = 'ws+unix:///var/lib/lxd/unix.socket';

	return this;
};

// Handle operation response
Client.prototype._process_async_response = function(body) {
	switch (body.metadata.class) {
	case 'task':
		return this._request('GET', '/operations/'+body.metadata.id+'/wait');
	case 'websocket':
		return this._create_sockets(body.metadata);
	case 'token':
		return body.metadata;
	default: 
		throw new Error('API returned unknown operation class');
	}
};

// TODO - this is now the latter part of the container.exec funcion, move to container and keep this client stuff
Client.prototype._create_sockets = function(data) {
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
			// Parse url ourselves to get around weirdness in ws lib
			var url = parser.parse(this.config.websocket);
			url.path = '/' + this._api_version + '/operations/' + data.id + '/websocket?secret=' + data.metadata.fds[key];

			sockets[socket_map[key]] = new WebSocket(url);
		});

		// Push messages to output array
		sockets.stdout.on('message', data => {
			var string = data.toString('utf8').trim();
			if(string) {
				output.stdout.push(string);
			}
		});
		sockets.stderr.on('message', data => {
			var string = data.toString('utf8').trim();
			if(string) {
				output.stderr.push(string);
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
			.then(test => {
				if(test.metadata.return !== 0) {
					throw new Error('Process exited with error code ' + test.metadata.return);
				} else {
					return output;
				}
			});
	});
};

// Request & handle response
Client.prototype._request = function(method, url, data) {
	return this._make_request(method, url, data)
		.then(body => this._process_response(body));
};

// Make a request to the LXD API
Client.prototype._make_request = function(method, path, data) {
	return new Promise((resolve, reject) => {
		request({
			url: this.config.url + path,
			agentOptions: {
				cert: this.config.cert,
				key: this.config.key,
				port: this.config.port,
				rejectUnauthorized: false,
			},
			headers: { 'Host': '' },
			method: method,
			json: true,
			body: typeof(data) !== 'undefined' ? data : {},
		}, (err, res, body) => {
			if(err) {
				reject(err);
			} else {
				resolve(body);
			}
		});
	});
};

// Handle API response
Client.prototype._process_response = function(body) {
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
	.then(() => new Container(this, name));
};

// Create and start a new container from image with name
Client.prototype.launch = function(image, name, config) {
	// Create container
	return this.create(image, name, config)
		// Start container
		.then(container => {
			return container.start()
				.then(() => container);
		});
};

// Get container instance
Client.prototype.get = function(name) {
	// Check for existence of container
	return this.list(name)
		.then(list => {
			// Get container with this name from list
			return list.filter(container => {
				container == '/1.0/containers/'+name;
			});
		})
		.then(found => {
			if(found) {
				// Return new container instance when it exists
				return new Container(this, name);
			} else {
				// Not existing
				throw new Error('Container not found');
			}
		});
};

// Get json list of containers
Client.prototype.list = function() {
	return this._request('GET', '/containers');
};

// Check if path exists on host
Client.prototype.path_exists = function(path) {
	return exec('stat', [path])
		.catch(() => {
			throw new Error('Path ' + path + ' on host does not exist');
		});
};

// Check if host path does not exist
Client.prototype.path_lacks = function(path) {
	return new Promise((resolve, reject) => {
		exec('stat', [path])
			.then(() => reject(new Error('Path ' + path + ' on host exists')))
			.catch(() => resolve());
	});
};

module.exports = Client;
