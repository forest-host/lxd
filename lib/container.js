
import Promise from 'bluebird';
import extend from 'extend';

/**
 * Represents a lxc container
 * @constructor
 * @param {Client} client - LXC client container will use to talk to lxd api.
 * @param {string} name - Name of the container we will operate on.
 */
function Container(client, name) {
	this._client = client;
	this.name = name;
};

Container.prototype._action = function(action, force) {
	if(typeof(force) === 'undefined') {
		force = false;
	}

	return this._client._request('PUT', '/containers/'+this.name+'/state', {
		action: action,
		timeout: 30,
		force: force,
	})
	.then(res => {
		if(res.err) {
			throw new Error(res.err);
		}
		return this;
	});
};

// Start this container
Container.prototype.start = function() {
	return this._action('start');
};

// Stop this container
Container.prototype.stop = function() {
	return this._action('stop');
};

// Delete this container
Container.prototype.delete = function() {
	return this.stop()
		.then(() => this._client._request('DELETE', '/containers/'+this.name));
};

/**
 * Patch container config
 * @param {Object} config - Partial config to set on container
 */
Container.prototype.patch = function(config) {
	return this.get_info()
		.then(info => this.update(extend(true, info, config)))
};

/**
 * Update container config
 * @param {Object} config - Full container info config to pass to container
 */
Container.prototype.update = function(config) {
	return this._client._request('PUT', '/containers/'+this.name, config)
		.then(() => this.get_info())
}


// Get config of this container from lxc list
Container.prototype.get_info = function() {
	return this._client._request('GET', '/containers/'+this.name);
};

// Get state of container
Container.prototype.get_state = function() {
	return this._client._request('GET', '/containers/'+this.name+'/state');
};

Container.prototype.get_ipv4_addresses = function() {
	return this.get_state()
		.then(state => {
			return state.network.eth0.addresses.filter(address => {
				return address.family == 'inet';
			});
		});
}

Container.prototype.wait_for_dhcp = function() {
	return this.get_ipv4_addresses()
		.then(addresses => {
			if( ! addresses.length) {
				// Wait for 500 ms, then try again
				return new Promise((resolve) => setTimeout(resolve, 500))
					.then(() => this.wait_for_dhcp());
			}

			return addresses[0];
		});
};

/**
 * Execute a command in the container
 * @param {string} cmd - Command to be executed in 
 * @param {Array} args - Array containing arguments for command
 * @param {Object} options - Object containing working directory
 */
Container.prototype.exec = function(cmd, args, options) {
	// Get correct options
	var last = arguments[arguments.length - 1];
	options = last === Object(last) ? last : {};

	// Change dir before command execution if cwd is set
	cmd = 'cwd' in options ? 'cd '+options.cwd+'; '+cmd : cmd;

	// Get correct args
	args = Array.isArray(arguments[1]) ? arguments[1] : [];

	// Add args to cmd
	cmd += args.length ? ' '+args.join(' ') : '';

	// Run command with joined args on container
	return this._client._request('POST', '/containers/'+this.name+'/exec', {
		command: ['/bin/bash', '-c', cmd],
		environment: options.environment || {},
		'wait-for-websocket': true,
		interactive: false,
	});
};

// Add mount
Container.prototype.mount = function(source, path, name) {
	var config = { devices: {} };

	config.devices[name] = {
		source: source,
		path: path,
		type: 'disk',
	};

	return this.patch(config);
};

Container.prototype.unmount = function(name) {
	return this.get_info()
		.then(info => {
			delete info.devices[name];

			return this.update(info);
		});
};

module.exports = Container;
/*
// Copy data from container to host
Container.prototype.download = function(container_path, host_path) {
	// Check for relative paths
	return validate_paths(host_path, container_path)
		.then(() => {
			var container_basename = path.basename(container_path);
			var host_basename = container_basename;

			// Get correct host path
			if(host_path.substring(host_path.length - 1) != '/') {
				host_basename = path.basename(host_path);
				host_path = path.dirname(host_path) + '/';
			}

			// Setup vars
			var dirname = path.dirname(container_path);
			var options = { cwd: dirname };
			var archive = container_basename + '.tar.gz';

			// Check if paths are valid
			return Promise.all([
				this._client.path_lacks(host_path + host_basename),
				this.path_exists(dirname + '/' + container_basename)
			])

				// Create archive in container
				.then(() => this.exec('tar', ['cfz', archive, container_basename], options))

				// Make sure target exists & copy archive to host
				.then(() => exec('mkdir', ['-p', host_path]))
				.then(() => exec('lxc', ['file', 'pull', this.name + '/' + dirname + '/' + archive, host_path]))

				// Extract archive on host & rename it if needed
				.then(() => exec('tar', ['xfz', archive], { cwd: host_path }))
				.then(() => {
					if(host_basename != container_basename) {
						// TODO name conflicts? Rename on container?
						return exec('mv', [container_basename, host_basename], { cwd: host_path });
					}
				})

				// Remove archive on host & remove archive in container
				.then(() => exec('rm', [archive], { cwd: host_path }))
				.then(() => this.exec('rm', [archive], options));
		});
};

// TODO - support relative paths?
// Copy data from host to container with name
Container.prototype.upload = function(host_path, container_path) {
	// Check for relative paths
	return validate_paths(host_path, container_path)
		.then(() => {
			// Setup names of directories and archive
			var host_basename = path.basename(host_path);
			var container_basename = host_basename;
			var archive = host_basename + '.tar.gz';

			// Get correct container path
			if(container_path.substring(container_path.length - 1) != '/') {
				container_basename = path.basename(container_path);
				container_path = path.dirname(container_path) + '/';
			}

			// Setup working dirs for host and container
			var host_options = { cwd: path.dirname(host_path) };
			var container_options = { cwd: container_path };

			return Promise.all([
				this._client.path_exists(host_path),
				this.path_lacks(container_path + container_basename),
			])

				// Create archive on host
				.then(() => exec('tar', ['cfz', archive, host_basename], host_options))

				// Push file to container
				.then(() => exec('lxc', ['file', 'push', archive, this.name + '/' + container_path], host_options))

				// Extract archive in container and move it to desired path when required
				.then(() => this.exec('tar', ['xfz', archive], container_options))
				.then(() => {
					if(host_basename != container_basename) {
						return this.exec('mv', [host_basename, container_basename], container_options);
					}
				})

				// Remove archive from container and from host
				.then(() => this.exec('rm', [archive], container_options))
				.then(() => exec('rm', [archive], host_options));
		});
};
*/
