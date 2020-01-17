
import extend from 'extend';
import { Readable as readable } from 'stream';

/**
 * Represents a lxd container
 * @constructor
 * @param {Client} client - lxd client container will use to talk to lxd api.
 * @param {string} name - Name of the container we will operate on.
 */
function Container(client, name) {
	this.client = client;
	this.name = name;
};

/**
 * Create container from lxd image
 * @param {object} config - Post body to pass directly on creation
 */
Container.prototype.create_from_image = function(config, target) {
	// Setup data
	var defaults = {
		name: this.name,
		architecture: 'x86_64',
		profiles: [ 'default' ],
		ephemeral: false,
	};

	// Create container
	return this.client.run_async_operation({
		method: 'POST',
		url: '/containers',
		body: Object.assign(defaults, config),
		qs: target ? { target: target } : {},
	})

	// Return container instance
	.then(() => this)
}

// Create and start a new container from image with name
Container.prototype.launch = function(config, target) {
	// Create container
	return this.create_from_image(config, target)
		// Start container
		.then(container => container.start());
};

/**
 * Execute an action on container
 * @param {String} action - Action to execute
 * @param {Boolean} force - Whether to force execution
 */
Container.prototype.action = function(action, force = false) {
	// create container request
	return this.client.run_async_operation({
		method: 'PUT',
		url: '/containers/'+this.name+'/state',
		body: { action, timeout: 60, force },
	})
	.then(res => {
		if(res.err)
			throw new Error(res.err);

		return this;
	});
};

// Start this container
Container.prototype.start = function() {
	return this.action('start');
};

// Stop this container
Container.prototype.stop = function() {
	return this.action('stop');
};

/**
 * Delete container
 */
Container.prototype.delete = function() {
	// Stop this thing
	return this.stop()
		.catch(err => {
			// That's okay
			if(err.message.indexOf('already stopped') != -1) {
				return;
			}
			if(err.message.indexOf('Container is not running') != -1) {
				return;
			}
	
			throw err;
		})

		.then(() => this.client.run_async_operation({ method: 'DELETE', url: '/containers/'+this.name }));
};

/**
 * Patch container config
 * @param {Object} config - Partial config to set on container
 */
Container.prototype.patch = function(config) {
	return this.client.run_operation({ method: 'PATCH', url: '/containers/'+this.name, body: config, })
		.then(() => this)
};

/**
 * Update container config
 * @param {Object} config - Full container info config to pass to container
 */
Container.prototype.update = function(config) {
	return this.client.run_async_operation({ method: 'PUT', url: '/containers/'+this.name, body: config, })
		.then(() => this)
}


// Get config of this container from lxd list
Container.prototype.get_info = function() {
	return this.client.run_operation({ method: 'GET', url: '/containers/'+this.name });
};

// Get state of container
Container.prototype.get_state = function() {
	return this.client.run_operation({ method: 'GET', url: '/containers/'+this.name+'/state' });
};

Container.prototype.get_ipv4_addresses = function() {
	return this.get_state()
		.then(state => {
			return state.network.eth0.addresses.filter(address => {
				return address.family == 'inet';
			});
		});
}

/**
 * Resolve a promise when container has aquired a ip address
 */
Container.prototype.wait_for_dhcp = function(retries = 0) {
	if(retries >= 60)
		throw new Error('Container could not get dhcp lease');

	return this.get_ipv4_addresses()
		.then(addresses => {
			if( ! addresses.length) {
				// Wait for 500 ms, then try again
				return new Promise((resolve) => setTimeout(resolve, 500))
					.then(() => this.wait_for_dhcp(++retries));
			}

			return this;
		});
};

/**
 * Execute a command in the container
 * @param {string} cmd - Command to be executed in container
 * @param {Array} args - (Optional) Array containing arguments for command
 * @param {Object} options - (Optional) Object containing working directory
 */
Container.prototype.exec = function(cmd, args, options) {
	// It is possible to not pass option so check last argument to see if it is a options object
	var last = arguments[arguments.length - 1];
	options = last === Object(last) ? last : {};

	// It is possible to not pass arguments, so check if second argument to function is an array of arguments
	args = Array.isArray(arguments[1]) ? arguments[1] : [];

	// Change dir before command execution if cwd is set
	cmd = 'cwd' in options && options.cwd != '' ? `cd ${options.cwd}; ${cmd}` : cmd;

	// Add args to cmd
	cmd += args.length ? ' ' + args.join(' ') : '';

	var body = {
		command: ['/bin/sh', '-c', cmd],
		environment: options.environment || {},
		'wait-for-websocket': true,
		interactive: true,
	};

	// Run command with joined args on container
	return this.client.run_async_operation({ 
		method: 'POST', 
		url: '/containers/'+this.name+'/exec',
		body,
		timeout: options.timeout,
		interactive: options.interactive,
	});
};

/**
 * Upload string to file in container
 */
Container.prototype.upload_string = function(string, path, retries = 3, wait_for = 0) {
	// TODO - Body used to be returned without content-type:json, check if this is still the case
	return this.client.raw_request({
		method: 'POST', 
		url: '/containers/' + this.name + '/files',
		// Path of file in query string
		qs: { path: path },
		json: false,
		headers: {
			'X-LXD-type': 'file',
			'Content-Type': 'plain/text',
		},
		body: string,
	})

  .catch(err => {
    let is_internal_error = err.message.indexOf('500') != -1;
    let is_file_not_exist = err.message.indexOf('file does not exist') != -1;

    // TODO - This temporarily tries to workaround https://github.com/lxc/lxd/issues/6644
    if (is_internal_error && is_file_not_exist && retries > 0) {
      console.log('LXD API returned 500 internal server error, retrying upload ' + retries + ' more times');
      return new Promise(resolve => setTimeout(() => resolve(), wait_for))
        .then(this.upload_string(string, path, retries - 1, wait_for + 200))
    }
  });
}

/**
 * Upload content to file in container
 * @param {Stream} stream - Read stream to upload
 * @param {String} path - Path in container to put content
 */
Container.prototype.upload = function(stream, path) {
	// TODO - Body used to be returned without content-type:json, check if this is still the case
	let request = this.client.raw_request({
		method: 'POST', 
		url: '/containers/' + this.name + '/files',
		// Path of file in query string
		qs: { path: path },
		json: false,
		headers: {
			'X-LXD-type': 'file',
		}
	});

	return new Promise((resolve, reject) => {
		stream.pipe(request);
		stream.on('error', reject)
		stream.on('end', () => {
			stream.destroy();
			resolve();
		});
	})
};

/**
 * Download file fronm container
 */
Container.prototype.download = function(path) {
	return this.client.raw_request({
		method: 'GET', 
		url: '/containers/' + this.name + '/files',
		// Path of file in query string
		qs: { path: path },
	})
};

module.exports = Container;
